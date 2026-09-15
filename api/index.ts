// O build copia o servidor compilado para api/bundle.js antes do empacotamento.
// Assim a função Vercel recebe o app Express completo no próprio diretório da API.
import app from "./bundle.js";

export default app;
