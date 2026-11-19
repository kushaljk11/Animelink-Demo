import { Assistant } from "@/components/portal/Assistant";
import { PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "AI assistant" };

export default function AssistantPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <PageHeader title="AI assistant" description="Runs fully offline with a bilingual rule-based engine. Bite and diagnosis questions are always referred to professionals." />
      <Assistant />
    </div>
  );
}
