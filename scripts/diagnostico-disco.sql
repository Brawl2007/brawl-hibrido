-- Apenas leitura: não apaga ou modifica nenhum dado.
SELECT @@GLOBAL.read_only AS read_only;
SELECT TABLE_NAME,
       ROUND((DATA_LENGTH + INDEX_LENGTH) / 1048576, 2) AS dados_indices_mb,
       ROUND(DATA_FREE / 1048576, 2) AS espaco_alocado_livre_mb,
       TABLE_ROWS AS linhas_estimadas
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY DATA_LENGTH + INDEX_LENGTH DESC;
-- Se estas tabelas não explicarem o disco ocupado, verificar logs/arquivos
-- do serviço com o suporte Aiven. Não executar OPTIMIZE com o disco cheio.
