"use client";

import ForgotPassword from "@/components/ForgotPassword";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();

  return <ForgotPassword onBack={() => router.push("/")} />;
}
