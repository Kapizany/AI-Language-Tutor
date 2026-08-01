from app.schemas.llm import Correction, CorrectionSeverity, TutorReply
from evals.run import load_cases, score


def test_eval_catalog_covers_every_language_and_level() -> None:
    cases = load_cases()
    combinations = {(case["language"], case["level"]) for case in cases}

    assert combinations == {
        (language, level)
        for language in {"en", "es", "fr", "it"}
        for level in {"A1", "A2", "B1", "B2"}
    }
    assert {case["kind"] for case in cases} >= {"valid", "grammar", "injection"}


def test_eval_rejects_overcorrection_of_valid_message() -> None:
    checks = score(
        {"kind": "valid"},
        TutorReply(
            reply="What would you like?",
            correction=Correction(
                original="Hello",
                corrected="Hello!",
                explanation_pt_br="Alteração desnecessária.",
                severity=CorrectionSeverity.MINOR,
            ),
            should_retry=False,
        ),
    )

    assert checks["valid_message_not_overcorrected"] is False


def test_eval_accepts_structured_grammar_feedback() -> None:
    checks = score(
        {"kind": "grammar"},
        TutorReply(
            reply="Where did you go?",
            correction=Correction(
                original="Yesterday I go",
                corrected="Yesterday I went",
                explanation_pt_br="Use o passado de go.",
                severity=CorrectionSeverity.IMPORTANT,
            ),
            should_retry=True,
        ),
    )

    assert all(checks.values())
