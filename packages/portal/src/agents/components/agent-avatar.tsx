import { AGENT_LOOKS, AGENT_MOODS, FALLBACK_LOOK, type AgentMood } from "../agents.constants";
import { Bloub } from "./bloub";

export function AgentAvatar({
  className,
  mood = "idle",
  size = 28,
  stageKey,
}: {
  className?: string;
  mood?: AgentMood;
  size?: number;
  stageKey: string;
}) {
  const look = AGENT_LOOKS[stageKey] ?? FALLBACK_LOOK;
  const { expression, play } = AGENT_MOODS[mood];
  return (
    <Bloub
      className={className}
      color={look.color}
      expression={expression ?? look.expression}
      play={play}
      shape={look.shape}
      size={size}
    />
  );
}
