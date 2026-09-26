import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";
import "./arena-v55.css";
import "./layout-v143.css";

const queryClient = new QueryClient();

/**
 * Uma pergunta que correu em segundo plano nunca manda ninguém para o login.
 *
 * POR QUE ISTO EXISTE
 *
 * O `/draft` expulsava qualquer visitante para a página de entrada. Não havia
 * regra nenhuma a dizer isso: o Draft é público, e todas as perguntas de que
 * ele precisa para funcionar são públicas. O que acontecia era isto —
 *
 *   1. a página do Draft carrega e, no meio das perguntas dela, vai buscar o
 *      estado da chave da API (`syncJobs.apiKeyState`), que é do dono;
 *   2. para quem não entrou, o servidor responde UNAUTHORIZED, e bem;
 *   3. este subscritor via o erro e chamava `startLogin()`.
 *
 * Ou seja: o site mandava a pessoa entrar por causa de uma pergunta que ela
 * nunca fez, feita por um painel que ela nem chegou a abrir. Para quem clica
 * num botão do dono, ir parar ao formulário de entrada é a resposta certa — foi
 * um pedido deliberado. Para uma pergunta de fundo, não é: é perder a página.
 *
 * Por isso o desvio fica só nas mutações. As perguntas continuam a ser
 * registadas na consola, e quem não pode ver uma coisa simplesmente não a vê.
 */
const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    // Sem desvio para o login: ver em baixo. Uma pergunta recusada é informação,
    // não é um pedido de entrada.
    console.error("[API Query Error]", event.query.state.error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
