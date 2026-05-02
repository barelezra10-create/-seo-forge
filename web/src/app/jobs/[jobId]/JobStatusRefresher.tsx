"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function JobStatusRefresher({ status }: { status: string }) {
  const router = useRouter();

  useEffect(() => {
    if (status === "succeeded" || status === "failed" || status === "skipped") {
      return; // terminal
    }
    const id = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [status, router]);

  return null;
}
