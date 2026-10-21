"""Questionnaire option ids and labels. A UI can render these directly; the engine only accepts these ids
(case/spacing-insensitive)."""

from __future__ import annotations

QUESTIONNAIRE_OPTIONS: dict[str, list] = {
    "interests": [
        {"id": "intelligent_systems", "label": "Building intelligent systems"},
        {"id": "web_building", "label": "Programming and building websites"},
        {"id": "data_patterns", "label": "Analyzing data and finding patterns"},
        {"id": "security_investigation", "label": "Protecting systems and investigating security problems"},
        {"id": "cloud_infrastructure", "label": "Working with cloud infrastructure"},
        {"id": "science_quantum", "label": "Exploring scientific and quantum technologies"},
        {"id": "ai_ethics_governance", "label": "Studying AI safety, ethics, alignment, or governance"},
        {"id": "organizing_projects", "label": "Organizing projects, teams, and workflows"},
        {"id": "helping_solving", "label": "Teaching, mentoring, researching, or solving practical problems"},
    ],
    "strengths": [
        {"id": "logical_reasoning", "label": "Logical reasoning"},
        {"id": "mathematics", "label": "Mathematics"},
        {"id": "communication", "label": "Communication"},
        {"id": "creativity", "label": "Creativity"},
        {"id": "research", "label": "Research"},
        {"id": "problem_solving", "label": "Problem-solving"},
        {"id": "teamwork", "label": "Teamwork"},
        {"id": "organization", "label": "Organization"},
        {"id": "programming", "label": "Programming"},
        {"id": "analytical_thinking", "label": "Analytical thinking"},
    ],
    "workStyles": [
        {"id": "building", "label": "Building and experimenting"},
        {"id": "investigating", "label": "Investigating and troubleshooting"},
        {"id": "analyzing", "label": "Analyzing information"},
        {"id": "researching", "label": "Researching scientific questions"},
        {"id": "helping_people", "label": "Helping people learn or make decisions"},
        {"id": "planning_coordinating", "label": "Planning, coordinating, and improving processes"},
    ],
    "goals": [
        {"id": "build_products", "label": "Build useful products"},
        {"id": "research", "label": "Conduct research"},
        {"id": "protect_people_orgs", "label": "Protect people and organizations"},
        {"id": "improve_education", "label": "Improve education"},
        {"id": "solve_community_problems", "label": "Solve community problems"},
        {"id": "start_business", "label": "Start a business"},
        {"id": "technical_career", "label": "Pursue a technical career"},
    ],
    "subjects": [
        {"id": "mathematics", "label": "Mathematics"},
        {"id": "physics", "label": "Physics"},
        {"id": "ict_computing", "label": "ICT / Computing"},
        {"id": "biology_chemistry", "label": "Biology / Chemistry"},
        {"id": "social_science_humanities", "label": "Social science / Humanities"},
        {"id": "business_economics", "label": "Business / Economics"},
        {"id": "languages_communication", "label": "Languages / Communication"},
    ],
    "mathConfidence": [1, 2, 3, 4, 5],
    "programmingExperience": ["none", "some", "comfortable", "strong"],
    "scienceBackground": ["none", "some", "comfortable", "strong"],
    "educationLevel": ["junior_secondary", "senior_secondary", "tertiary", "graduate", "other"],
    "budget": ["none", "low", "flexible"],
    "internet": ["unreliable", "limited", "reliable"],
    "device": ["phone_only", "low_spec_computer", "standard_computer"],
    "learningFormats": ["video", "text", "interactive", "hands_on", "community"],
}
