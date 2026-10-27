"""Slim free-exercise-db (public domain, github.com/yuhonas/free-exercise-db) into public/exercises.json.

Keeps what the picker shows: name, muscles, equipment, level, category and the how-to steps. Entries that are one of
the app's ranked lifts (src/core/exercises.ts) take the app's name, so logging them keeps ranks and progression
working; the library's own name stays as `alt` for search.

    python -I art/slim_exercises.py art/free-exercise-db/exercises.json public/exercises.json
"""
import json
import sys

# library id -> ranked exercise id and name in src/core/exercises.ts (one library entry per ranked lift)
RANKED = {
    "Barbell_Bench_Press_-_Medium_Grip": ("bench-press", "Bench press"),
    "Barbell_Incline_Bench_Press_-_Medium_Grip": ("incline-bench-press", "Incline bench press"),
    "Dumbbell_Bench_Press": ("dumbbell-bench-press", "Dumbbell bench press"),
    "Incline_Dumbbell_Press": ("incline-dumbbell-press", "Incline dumbbell press"),
    "Dumbbell_Flyes": ("chest-fly", "Chest fly"),
    "Dips_-_Chest_Version": ("dips", "Dips"),
    "Barbell_Deadlift": ("deadlift", "Deadlift"),
    "Bent_Over_Barbell_Row": ("barbell-row", "Barbell row"),
    "One-Arm_Dumbbell_Row": ("dumbbell-row", "Dumbbell row"),
    "Pullups": ("pull-up", "Pull-up"),
    "Chin-Up": ("chin-up", "Chin-up"),
    "Wide-Grip_Lat_Pulldown": ("lat-pulldown", "Lat pulldown"),
    "Seated_Cable_Rows": ("seated-cable-row", "Seated cable row"),
    "Standing_Military_Press": ("overhead-press", "Overhead press"),
    "Dumbbell_Shoulder_Press": ("dumbbell-shoulder-press", "Dumbbell shoulder press"),
    "Side_Lateral_Raise": ("lateral-raise", "Lateral raise"),
    "Reverse_Flyes": ("rear-delt-fly", "Rear delt fly"),
    "Barbell_Curl": ("barbell-curl", "Barbell curl"),
    "Dumbbell_Bicep_Curl": ("dumbbell-curl", "Dumbbell curl"),
    "Hammer_Curls": ("hammer-curl", "Hammer curl"),
    "Triceps_Pushdown": ("tricep-pushdown", "Tricep pushdown"),
    "EZ-Bar_Skullcrusher": ("skull-crusher", "Skull crusher"),
    "Standing_Dumbbell_Triceps_Extension": ("overhead-tricep-extension", "Overhead tricep extension"),
    "Barbell_Squat": ("squat", "Squat"),
    "Front_Barbell_Squat": ("front-squat", "Front squat"),
    "Leg_Press": ("leg-press", "Leg press"),
    "Romanian_Deadlift": ("romanian-deadlift", "Romanian deadlift"),
    "Barbell_Hip_Thrust": ("hip-thrust", "Hip thrust"),
    "Barbell_Lunge": ("lunge", "Lunge"),
    "Lying_Leg_Curls": ("leg-curl", "Leg curl"),
    "Leg_Extensions": ("leg-extension", "Leg extension"),
    "Standing_Calf_Raises": ("calf-raise", "Calf raise"),
}


def main(src: str, dst: str) -> None:
    raw = json.load(open(src, encoding="utf-8"))
    ids = {x["id"] for x in raw}
    missing = [k for k in RANKED if k not in ids]
    if missing:
        sys.exit(f"ranked ids not in the library: {missing}")
    out = []
    for x in raw:
        item = {
            "id": x["id"],
            "name": x["name"].strip(),
            "primary": x["primaryMuscles"],
            "secondary": x["secondaryMuscles"],
            "equipment": x.get("equipment") or "other",
            "level": x["level"],
            "category": x["category"],
            "steps": [s.strip() for s in x["instructions"] if s.strip()],
        }
        if x["id"] in RANKED:
            ranked, name = RANKED[x["id"]]
            item.update(name=name, alt=item["name"], ranked=ranked)
        out.append(item)
    out.sort(key=lambda e: e["name"].lower())
    with open(dst, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out)} exercises, {sum('ranked' in e for e in out)} ranked -> {dst}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
