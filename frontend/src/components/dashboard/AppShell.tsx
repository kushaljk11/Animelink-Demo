"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { SessionProvider, type ClientSession } from "@/lib/client/session";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

const COLLAPSE_KEY = "rtn.sidebar.collapsed";

export function AppShell({ session, children }: { session: ClientSession; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Restore after mount so server and first client render agree.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  };

  return (
    <SessionProvider session={session}>
      <div className="flex h-dvh overflow-hidden">
        <div className="hidden lg:block">
          <Sidebar collapsed={collapsed} onToggle={toggle} />
        </div>

        <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[1200] animate-fade-in bg-black/50 lg:hidden" />
            <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-[1201] w-72 max-w-[85vw] animate-fade-in lg:hidden">
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">Main navigation</DialogPrimitive.Description>
              <Sidebar collapsed={false} mobile onNavigate={() => setMobileOpen(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <Header onOpenMobileNav={() => setMobileOpen(true)} />
          <main className="scroll-thin flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
