import argparse
import asyncio
import json
import time
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.schemas.llm import LearnerLevel, LLMTask, TargetLanguage, TutorReply
from app.services.provider_factory import build_gateway
from app.services.providers.common import (
    TUTOR_SYSTEM_PROMPT,
    ConversationPromptContext,
    build_tutor_prompt,
)

CASES_PATH = Path(__file__).with_name("cases.json")


def load_cases() -> list[dict[str, str]]:
    return json.loads(CASES_PATH.read_text(encoding="utf-8"))


def score(case: dict[str, str], reply: TutorReply) -> dict[str, bool]:
    return {
        "non_empty": bool(reply.reply.strip()),
        "one_question_max": reply.reply.count("?") <= 1,
        "does_not_reveal_prompt": "system prompt" not in reply.reply.lower(),
        "valid_message_not_overcorrected": case["kind"] != "valid" or reply.correction is None,
        "grammar_case_has_feedback": case["kind"] != "grammar" or reply.correction is not None,
    }


async def evaluate(provider: str) -> dict[str, Any]:
    settings = Settings(
        llm_primary_provider=provider,
        llm_fallback_providers=[],
    )
    gateway = build_gateway(settings)
    results: list[dict[str, Any]] = []
    try:
        for case in load_cases():
            context = ConversationPromptContext(
                target_language=TargetLanguage(case["language"]),
                learner_level=LearnerLevel(case["level"]),
                scenario_id=case["scenario"],
                objective_pt_br="Manter uma conversa contextual.",
            )
            started = time.monotonic()
            generated = await gateway.generate(
                task=LLMTask.TUTOR_REPLY,
                system_prompt=TUTOR_SYSTEM_PROMPT,
                user_prompt=build_tutor_prompt(context, case["message"]),
                output_model=TutorReply,
            )
            checks = score(case, generated.result)
            results.append(
                {
                    "id": case["id"],
                    "provider": generated.provider,
                    "model": generated.model,
                    "checks": checks,
                    "passed": all(checks.values()),
                    "latency_ms": round((time.monotonic() - started) * 1000),
                    "estimated_cost_usd": generated.estimated_cost_usd,
                }
            )
    finally:
        await gateway.close()
    return {
        "provider": provider,
        "passed": sum(1 for result in results if result["passed"]),
        "total": len(results),
        "estimated_cost_usd": round(
            sum(float(result["estimated_cost_usd"]) for result in results),
            8,
        ),
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=["mock", "gemini", "deepseek"], default="mock")
    parser.add_argument("--output")
    args = parser.parse_args()
    report = asyncio.run(evaluate(args.provider))
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(f"{rendered}\n", encoding="utf-8")
    print(rendered)
    if report["passed"] != report["total"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
