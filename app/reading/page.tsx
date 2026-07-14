import type { Metadata } from "next";
import ReadingClient from "./reading-client";

export const metadata: Metadata = {
  title: "Reading Archive | Harvey Tracker",
  description: "毎日の読書と読了本を記録するプライベート・リーディングアーカイブ。",
};

export default function ReadingPage() {
  return <ReadingClient />;
}
