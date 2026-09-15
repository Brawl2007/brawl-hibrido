import { DraftRolesProvider } from "./contexts/DraftRolesContext";
/*
 * Brawl Híbrido — app shell.
 * The dashboard owns its dark Championship Arena canvas and stays single-page
 * so map selection, filters, and the full ranked matrix remain one focused flow.
 */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import VersaoDoSite from "./components/VersaoDoSite";
import { CounterSyncProvider } from "./contexts/CounterSyncContext";
import { RankedSyncProvider } from "./contexts/RankedSyncContext";
import { ThemeProvider } from "./contexts/ThemeContext";

const Home = lazy(() => import("./pages/Home"));
const Draft = lazy(() => import("./pages/Draft"));
const Brawlers = lazy(() => import("./pages/Brawlers"));
const BrawlerDetail = lazy(() => import("./pages/BrawlerDetail"));
const MatchupMatrix = lazy(() => import("./pages/MatchupMatrix"));
const Entrar = lazy(() => import("./pages/Entrar"));

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0b0e14] text-slate-300 grid place-items-center text-sm tracking-[.12em] uppercase">A carregar arena…</div>}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/draft" component={Draft} />
        <Route path="/matchups" component={MatchupMatrix} />
        <Route path="/brawlers" component={Brawlers} />
        <Route path="/brawlers/:name" component={BrawlerDetail} />
        <Route path="/entrar" component={Entrar} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <CounterSyncProvider>
          <RankedSyncProvider>
            <TooltipProvider>
            <VersaoDoSite />
            <Toaster theme="dark" position="bottom-right" />
            <DraftRolesProvider><Router /></DraftRolesProvider>
            </TooltipProvider>
          </RankedSyncProvider>
        </CounterSyncProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
