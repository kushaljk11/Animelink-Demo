import { redirect } from "next/navigation";

/** Legacy path used by chatbot links and printed material. */
export default function ReportRedirect() {
  redirect("/submit");
}
