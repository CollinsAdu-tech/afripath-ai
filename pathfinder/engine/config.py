"""Central configuration for the recommendation engine.

ALL tunable numbers live here so they can be reviewed and changed in one place.
See docs/SCORING_AND_MAPPING.md for what each value means and how to change it safely.
"""

from __future__ import annotations

from types import MappingProxyType
from typing import Any

ENGINE_VERSION = "0.1.0"  # engine behaviour version (unchanged by the Python port: same scoring, same responses)
SCORING_MODEL = "weighted-affinity-v1"


def _freeze(o: Any) -> Any:
    if isinstance(o, dict):
        return MappingProxyType({k: _freeze(v) for k, v in o.items()})
    if isinstance(o, list):
        return tuple(_freeze(v) for v in o)
    return o


CONFIG = _freeze({
    # Factor weights. Relative importance; renormalised over the factors that can be evaluated for a given
    # student, so a skipped question never counts as a "zero". Initial values per product spec.
    "weights": {"interests": 0.35, "strengths": 0.25, "workStyle": 0.15, "academic": 0.15, "goals": 0.10},

    # A student selects several options. Their affinity to a career is a blend of the AVERAGE (rewards overall
    # alignment) and the BEST single match (so one strong fit is not drowned out by unrelated selections).
    "selectionBlend": {"mean": 0.5, "max": 0.5},

    # Strengths factor: skills the student has vs skills they want to develop. One list alone is used on its own.
    "skillBlend": {"current": 0.7, "develop": 0.3},

    # Academic factor: subjects studied vs preparation levels (maths / programming / science).
    "academicBlend": {"subjects": 0.5, "preparation": 0.5},

    # Academic preparation never acts as a barrier: a prerequisite gap lowers a preparation sub-score only down
    # to this floor (0..1), i.e. at most (1 - floor) * academic weight points.
    "prepGapFloor": 0.5,

    # For introductory "foundation" paths only: how useful the path still is for a student who already has this
    # much programming experience (a redundancy signal, not an ability judgement).
    "foundationRedundancy": {"none": 1, "some": 1, "comfortable": 0.6, "strong": 0.3},

    # Level scales (0..3) shared by questionnaire answers and the taxonomy's `prep` requirements.
    "levels": {
        "experience": {"none": 0, "some": 1, "comfortable": 2, "strong": 3},
        "mathConfidence": {1: 0, 2: 1, 3: 1, 4: 2, 5: 3},
    },

    # An answer counts as "matched" in explanations when its affinity to the career is at least this.
    "matchThreshold": 0.6,

    # Evidence thresholds, as the share of total spec weight that could be evaluated.
    "evidence": {
        "minApplicableWeight": 0.25,     # below this the engine refuses to rank and asks for more information
        "minWeightWithoutCore": 0.4,     # without interests or strengths a higher bar applies
        "exploratoryBelowWeight": 0.5,   # below this the result is labelled exploratory
        "closeScoreSpread": 5,           # top and last scores closer than this many points: say the paths fit similarly
    },

    # Careers scoring below this are not returned as recommendations (they remain visible under `explore`).
    "minMeaningfulScore": 40,

    # If a student selects this many interests or more, little separates the paths: tell them so.
    "broadSelectionInterests": 6,
    "maxRecommendations": 3,

    # Wording bands for the 0-100 heuristic fit score (editorial; not statistical).
    "fitBands": [
        {"min": 75, "id": "strong_alignment", "label": "Strong alignment with your answers"},
        {"min": 60, "id": "good_alignment", "label": "Good alignment with your answers"},
        {"min": 0, "id": "some_alignment", "label": "Some alignment, worth exploring"},
    ],
    # Used instead of the bands when the student answered too little for a firm reading.
    "exploratoryBand": {"id": "early_signal", "label": "Early signal from limited answers"},

    # Pacing hint: how many resources to focus on per week, by weekly study hours. A suggestion for ORDERING
    # work, NOT a duration estimate from the knowledge base.
    "pacing": [
        {"maxHours": 2, "itemsPerWeek": 1},
        {"maxHours": 5, "itemsPerWeek": 2},
        {"maxHours": float("inf"), "itemsPerWeek": 3},
    ],

    "limits": {
        "maxArrayAnswers": 20,
        "startingResources": 5,
        "projectsPerRecommendation": 3,
        "skillsToBuildFirst": 4,
        "guidanceTips": 3,
    },
})

FACTOR_LABELS = MappingProxyType({
    "interests": "Interests",
    "strengths": "Strengths and skills",
    "workStyle": "Preferred way of working",
    "academic": "Academic preparation",
    "goals": "Goals",
})

HEURISTIC_NOTE = (
    "This is a heuristic fit score (0 to 100) based only on the answers you gave. "
    "It is not a prediction of success and not a judgement of your potential. Use it to explore."
)
