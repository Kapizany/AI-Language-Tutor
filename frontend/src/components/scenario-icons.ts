import {
  BriefcaseBusiness,
  Coffee,
  Globe2,
  Headphones,
  MessageCircle,
  Plane,
  Utensils,
} from "lucide-react";
import { createElement } from "react";
import type { IconType } from "@/lib/learner";

/**
 * `conversation_scenarios.icon` guarda uma chave simbólica, não um componente.
 * Um cenário novo cadastrado no banco com um ícone desconhecido continua
 * funcionando com o ícone padrão.
 */
const icons: Record<string, IconType> = {
  coffee: Coffee,
  plane: Plane,
  briefcase: BriefcaseBusiness,
  utensils: Utensils,
  globe: Globe2,
  headphones: Headphones,
};

export function scenarioIcon(key: string): IconType {
  return icons[key] || MessageCircle;
}

export function renderScenarioIcon(key: string) {
  return createElement(icons[key] || MessageCircle);
}

export const categoryLabels: Record<string, string> = {
  daily: "Cotidiano",
  professional: "Profissional",
  travel: "Viagem",
};

export function levelRange(minLevel: string, maxLevel: string) {
  return minLevel === maxLevel ? minLevel : `${minLevel}–${maxLevel}`;
}
