#!/usr/bin/env bash
# =============================================================================
# Aplica el esquema y el seed de SQL Server.
#
# Es el único motor de los cinco que no se siembra solo: su imagen no tiene un
# directorio initdb.d, así que el trabajo lo hace este contenedor auxiliar, que
# espera a que el servidor acepte conexiones, aplica los .sql y termina.
#
# Idempotente a propósito: se comprueba si BRANCHES ya existe antes de aplicar
# nada, para que levantar el contenedor una segunda vez no duplique el seed.
# =============================================================================
set -euo pipefail

SQLCMD=/opt/mssql-tools18/bin/sqlcmd
SERVIDOR="${DB_HOST:-mssql}"
PASSWORD="${SA_PASSWORD:?falta SA_PASSWORD}"

# -C acepta el certificado autofirmado que trae la imagen; sin él sqlcmd 18 se
# niega a conectar. -b hace que un error de T-SQL devuelva un código distinto de
# cero: sin esa opción sqlcmd imprime "Msg 102" y termina con éxito igualmente.
consulta() {
  "$SQLCMD" -S "$SERVIDOR" -U sa -P "$PASSWORD" -C -b -h -1 -W -Q "$1"
}

echo "[mssql-init] esperando a que $SERVIDOR acepte conexiones..."
for intento in $(seq 1 60); do
  if consulta "SELECT 1" > /dev/null 2>&1; then
    echo "[mssql-init] servidor listo tras $intento intentos"
    break
  fi
  if [ "$intento" -eq 60 ]; then
    echo "[mssql-init] el servidor no respondió a tiempo" >&2
    exit 1
  fi
  sleep 2
done

# DB_ID devuelve NULL si testdb todavía no existe, así que se comprueba antes de
# mirar sus tablas: consultar testdb.sys.tables sin base sería un error.
existente=$(consulta "SET NOCOUNT ON;
IF DB_ID('testdb') IS NULL SELECT 0
ELSE SELECT COUNT(*) FROM testdb.sys.tables WHERE name = 'BRANCHES';" | tr -d '[:space:]')

if [ "$existente" != "0" ]; then
  echo "[mssql-init] el esquema ya está aplicado, no se toca nada"
  exit 0
fi

for fichero in /sql/01_schema.sql /sql/02_seed.sql; do
  echo "[mssql-init] aplicando $fichero"
  "$SQLCMD" -S "$SERVIDOR" -U sa -P "$PASSWORD" -C -b -i "$fichero"
done

echo "[mssql-init] esquema y datos de ejemplo aplicados"
