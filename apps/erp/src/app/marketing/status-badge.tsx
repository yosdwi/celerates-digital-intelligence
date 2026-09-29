"use client";
import { useTranslations } from "next-intl";
import { Pill } from "@/components/pill";

export function StatusBadge({ isQualified }: { isQualified: boolean | null }) {
  const t = useTranslations("marketing");
  if (isQualified === null) return <Pill variant="neutral">{t("notDecided")}</Pill>;
  if (isQualified) return <Pill variant="success">Qualified</Pill>;
  return <Pill variant="critical">Disqualified</Pill>;
}
