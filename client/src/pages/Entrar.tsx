/**
 * Entrada do dono.
 *
 * Ver `shared/ownerLogin.ts` para o motivo de o login do Manus ter deixado de
 * servir. Aqui interessa uma coisa: quem chega a esta página é o dono do site a
 * tentar entrar, e a página tem de lhe dizer a verdade sobre o que correu mal.
 * Dizer só "não foi possível entrar" mandava-o adivinhar entre uma palavra-passe
 * errada e uma variável que nunca foi definida no alojamento — dois problemas
 * com soluções opostas.
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { KeyRound, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function Entrar() {
  const [, setLocation] = useLocation();
  const [palavraPasse, setPalavraPasse] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const estado = trpc.auth.ownerLoginState.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();

  const entrar = trpc.auth.ownerLogin.useMutation({
    onSuccess: async () => {
      setErro(null);
      // A sessão mudou: o `me` em cache ainda diz "ninguém". Sem isto, a página
      // seguinte continuava a achar que não há dono.
      await utils.auth.me.invalidate();
      setLocation("/draft");
    },
    onError: (error) => setErro(error.message),
  });

  const semPalavraPasseDefinida = estado.data?.configured === false;
  const palavraPasseFraca = estado.data?.configured === true && estado.data.strongEnough === false;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0b0e14] px-4">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900/60">
        <CardContent className="pt-8 pb-8">
          <div className="flex justify-center mb-6">
            <KeyRound className="h-12 w-12 text-amber-400" aria-hidden />
          </div>

          <h1 className="text-2xl font-bold text-slate-100 text-center mb-2">Entrar como dono</h1>
          <p className="text-sm text-slate-400 text-center mb-6">
            {/*
              Esta frase dizia "O Draft, o diagnóstico e a colagem de fichas são
              só para ti" — e o Draft não é. Draftar, ver a matriz, o catálogo e
              os mapas é de toda a gente e nunca pediu entrada; o que é só teu
              são os comandos que mexem nos dados.
            */}
            "Atualizar agora", o diagnóstico das fontes, a chave da API e a colagem de fichas são só para ti.
            O Draft e o resto do site são para toda a gente, sem entrar.
          </p>

          {semPalavraPasseDefinida && (
            <div className="mb-5 flex gap-3 rounded-md border border-amber-700/60 bg-amber-950/40 p-3 text-sm text-amber-200">
              <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
              <span>
                Este site ainda não tem palavra-passe. No painel do alojamento, cria a variável{" "}
                <code className="font-mono text-amber-100">OWNER_PASSWORD</code> e reinicia o site.
              </span>
            </div>
          )}

          {palavraPasseFraca && (
            <div className="mb-5 flex gap-3 rounded-md border border-amber-700/60 bg-amber-950/40 p-3 text-sm text-amber-200">
              <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
              <span>
                A palavra-passe definida no alojamento é curta de mais. Usa pelo menos 8 caracteres.
              </span>
            </div>
          )}

          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              setErro(null);
              entrar.mutate({ password: palavraPasse });
            }}
          >
            <label htmlFor="owner-password" className="block text-sm text-slate-300 mb-2">
              Palavra-passe
            </label>
            <Input
              id="owner-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={palavraPasse}
              onChange={(evento) => setPalavraPasse(evento.target.value)}
              className="mb-4 bg-slate-950 border-slate-700 text-slate-100"
            />

            {erro && (
              <p role="alert" className="mb-4 text-sm text-red-400">
                {erro}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={entrar.isPending || palavraPasse.length === 0 || semPalavraPasseDefinida}
            >
              {entrar.isPending ? "A entrar…" : "Entrar"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setLocation("/")}
            className="mt-6 w-full text-center text-sm text-slate-500 hover:text-slate-300"
          >
            Voltar ao site
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
