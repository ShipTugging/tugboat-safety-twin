"""Read-only verification of a completed Multimodal Recording V1 session."""
import argparse
import json
from pathlib import Path
from recording_io import validate_recording, validate_video


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recording-dir', type=Path, required=True)
    args = parser.parse_args()
    try:
        report = validate_recording(args.recording_dir)
        report['video'] = validate_video(args.recording_dir / 'camera.mp4',
                                        report['camera_frames'], report['duration_ms']/1000)
    except (OSError, ValueError, KeyError) as exc:
        parser.exit(1, f'Recording validation failed: {exc}\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
