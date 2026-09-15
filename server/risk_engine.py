"""Time-based prototype rules. Image angles never stand in for a 3D towing angle."""
import json
import math
from collections import deque
from pathlib import Path

STATES = ('Normal', 'Loaded', 'GirtingRisk', 'Developing', 'Critical')


def load_policy(path=None):
    config = json.loads(Path(path or Path(__file__).with_name('risk_policy.json')).read_text(encoding='utf-8'))
    for key, value in config.items():
        if key not in ('version', 'provenance') and (not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0):
            raise ValueError(f'Invalid policy field: {key}')
    if not 0 < config['roll_risk_deg'] < config['roll_developing_deg'] < config['roll_critical_deg'] <= 90:
        raise ValueError('Roll thresholds must be ordered')
    if config['confirm_s'] >= config['recovery_s'] or config['history_s'] > config['max_gap_s']:
        raise ValueError('Invalid temporal policy')
    return config


def angle_distance(a, b):
    # A mask establishes an unoriented line, not the physical bow/stern direction.
    return abs((a-b+90) % 180-90)


class TemporalRiskEngine:
    def __init__(self, policy=None):
        self.policy = dict(policy or load_policy())
        self.last_t = None
        self.history = deque()
        self.calibration = deque()
        self.baseline = None
        self.level = 0
        self.pending = None
        self.confirmations = {}
        self.recovery = None
        self.last_reason = []

    def reset_vision(self):
        self.history.clear()
        self.calibration.clear()
        self.baseline = None
        self.pending = self.recovery = None
        self.confirmations.clear()

    def update(self, timestamp, sag, angle, roll, roll_rate, observation='valid'):
        if not all(isinstance(v,(int,float)) and math.isfinite(v) for v in (timestamp,roll,roll_rate)) or timestamp < 0:
            raise ValueError('Finite nonnegative timestamp and finite IMU required')
        if self.last_t is not None and timestamp <= self.last_t:
            raise ValueError('Capture timestamps must strictly increase')
        p = self.policy
        gap = self.last_t is not None and timestamp-self.last_t > p['max_gap_s']
        if gap: self.reset_vision()
        self.last_t = timestamp
        valid = observation == 'valid' and all(v is not None and math.isfinite(v) for v in (sag,angle)) and sag >= 0
        if observation == 'valid' and not valid: observation = 'invalid'
        rate = delta = None
        reasons = []
        if valid:
            self.history.append((timestamp,sag))
            while self.history and timestamp-self.history[0][0] > p['history_s']+1e-9: self.history.popleft()
            if len(self.history) >= 3 and timestamp-self.history[0][0] >= .2-1e-9:
                # Center timestamps to avoid loss of precision for Unix-epoch inputs.
                xs = [t-self.history[0][0] for t,_ in self.history]
                mx, my = sum(xs)/len(xs), sum(v for _,v in self.history)/len(xs)
                rate = sum((x-mx)*(v-my) for x,(_,v) in zip(xs,self.history))/sum((x-mx)**2 for x in xs)
            if self.baseline is None:
                if abs(roll) <= p['calibration_max_roll_deg'] and abs(roll_rate) <= p['calibration_max_rate_deg_s']:
                    if self.calibration and angle_distance(angle,self.calibration[0][1]) > p['calibration_angle_spread_deg']:
                        self.calibration.clear()
                    self.calibration.append((timestamp,angle))
                    if len(self.calibration) >= 5 and timestamp-self.calibration[0][0] >= p['calibration_s']-1e-9:
                        # Circular mean for an unoriented line (period 180 degrees).
                        x=sum(math.cos(math.radians(a*2)) for _,a in self.calibration)
                        y=sum(math.sin(math.radians(a*2)) for _,a in self.calibration)
                        self.baseline=math.degrees(math.atan2(y,x))/2
                        self.calibration.clear()
                else: self.calibration.clear()
            if self.baseline is not None: delta=angle_distance(angle,self.baseline)
        else:
            self.history.clear()
            self.calibration.clear()
            # Missing frames cannot silently establish a new visual baseline.
            reasons.append('VISION_'+observation.upper())

        candidate = 0
        if valid and sag < p['sag_loaded']:
            candidate=1;reasons.append('SAG_LOADED')
            if rate is not None and rate <= -p['sag_fall_per_s']:
                candidate=2;reasons.append('RAPID_TIGHTENING')
            if delta is not None and delta >= p['angle_change_risk_deg']:
                candidate=max(candidate,2);reasons.append('ANGLE_CHANGE')
            if delta is not None and delta >= p['angle_change_developing_deg'] and abs(roll)>=p['roll_risk_deg']:
                candidate=max(candidate,3);reasons.append('ANGLE_AND_ROLL')
        # IMU is evaluated in every mode, independently of vision confidence.
        for threshold,level,code in [(p['roll_risk_deg'],2,'ROLL_RISK'),(p['roll_developing_deg'],3,'ROLL_DEVELOPING'),(p['roll_critical_deg'],4,'ROLL_CRITICAL')]:
            if abs(roll)>=threshold:
                candidate=max(candidate,level);reasons.append(code)
        rising = roll*roll_rate > 0
        if rising and abs(roll)>=p['rising_roll_min_deg']:
            if abs(roll_rate)>=p['roll_rate_risk_deg_s']:
                candidate=max(candidate,2);reasons.append('ROLL_RISING')
            if abs(roll_rate)>=p['roll_rate_developing_deg_s']:
                candidate=max(candidate,3);reasons.append('ROLL_RISING_FAST')

        for target in range(2,5):
            if candidate>=target:
                start,count=self.confirmations.get(target,(timestamp,0))
                self.confirmations[target]=(start,count+1)
            else:self.confirmations.pop(target,None)
        if candidate > self.level:
            self.recovery=None
            if candidate==1: self.level=1;self.pending=None
            else:
                for target,(start,count) in self.confirmations.items():
                    if count>=2 and timestamp-start>=p['confirm_s']-1e-9:self.level=max(self.level,target)
                self.pending=candidate if candidate>self.level else None
        elif candidate < self.level:
            self.pending=None
            # Incomplete evidence cannot clear a previously confirmed danger.
            if valid:
                if self.recovery is None or self.recovery[0]!=candidate: self.recovery=(candidate,timestamp)
                if timestamp-self.recovery[1]>=p['recovery_s']-1e-9:
                    self.level=candidate;self.recovery=None
            else: self.recovery=None
        else: self.pending=self.recovery=None
        if candidate>=self.level and self.level>=2: self.last_reason=list(reasons)
        if self.level>=2 and candidate<self.level:
            reasons+=['RISK_HELD']+self.last_reason
        if self.baseline is None: reasons.append('BASELINE_PENDING')
        if gap: reasons.append('TIMESTAMP_GAP')
        if self.pending: reasons.append('CONFIRMING')
        state = 'UNKNOWN' if not valid and self.level<2 else STATES[self.level]
        return {'risk_state':state,'candidate_state':STATES[candidate],
                'observation_status':observation,'sag_ratio_rate_per_s':rate,'angle_delta_deg':delta,
                'baseline_angle_deg':self.baseline,'calibration_status':'ready' if self.baseline is not None else 'pending',
                'reason_codes':list(dict.fromkeys(reasons or ['WITHIN_POLICY'])),
                'policy_version':p['version'],'policy_scope':'prototype_not_real_vessel_validated',
                'thresholds':dict(p)}
