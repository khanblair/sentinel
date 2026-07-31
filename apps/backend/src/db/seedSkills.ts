import type { PrismaClient } from "@prisma/client";

/** Built-in Skills (design §5.6) — referenced by name from Assistant.defaultSkills. */
export const BUILT_IN_SKILLS: ReadonlyArray<{ name: string; definition: string }> = [
  {
    name: "network-assertion",
    definition: "Assert on network responses (status codes, response bodies) triggered by page actions, not just what's visible in the DOM.",
  },
  {
    name: "accessibility-audit",
    definition: "Check alt text, color contrast, keyboard navigation, and ARIA roles in addition to any given Test Case checks.",
  },
  {
    name: "visual-diff",
    definition: "Compare the current page's appearance against a stored baseline screenshot and flag visual differences.",
  },
];

/** Idempotent: safe to call on every backend boot, not just via `prisma db seed`. */
export async function seedBuiltInSkills(prisma: PrismaClient): Promise<void> {
  for (const skill of BUILT_IN_SKILLS) {
    const existing = await prisma.skill.findUnique({ where: { name: skill.name } });
    if (existing) {
      await prisma.skill.update({ where: { id: existing.id }, data: { definition: skill.definition, isBuiltIn: true } });
    } else {
      await prisma.skill.create({ data: { name: skill.name, definition: skill.definition, isBuiltIn: true } });
    }
  }
}
