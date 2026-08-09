#!/usr/bin/env bash
#
# Se ejecuta una sola vez, la primera vez que el contenedor crea la base de datos.
# La imagen gvenzl/oracle-free corre todo lo que encuentre en
# /container-entrypoint-initdb.d, pero no garantiza con qué usuario ni contra qué
# contenedor (CDB vs PDB) se ejecutan los .sql sueltos. Para que el esquema quede
# siempre bajo APP_USER dentro del PDB, aquí abrimos sqlplus explícitamente con
# esas credenciales y aplicamos los scripts montados en /opt/appsql.
set -euo pipefail

PDB="${ORACLE_DATABASE:-FREEPDB1}"
USR="${APP_USER:-appuser}"
PWD_="${APP_USER_PASSWORD:?APP_USER_PASSWORD is required}"
SQL_DIR="/opt/appsql"

echo "[init] Aplicando esquema en ${PDB} como ${USR}"

for script in "${SQL_DIR}"/*.sql; do
  [ -e "${script}" ] || continue
  echo "[init] Ejecutando ${script}"
  sqlplus -s -L "${USR}/${PWD_}@//localhost:1521/${PDB}" <<EOF
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET ECHO OFF
SET FEEDBACK ON
@${script}
EXIT
EOF
done

echo "[init] Esquema listo"
