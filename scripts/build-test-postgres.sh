#!/bin/sh
# Optional development-only PostgreSQL 16. No server is left running.
# Debian build dependencies: build-essential libreadline-dev zlib1g-dev libssl-dev bison flex pkg-config.
set -eu
ROOT=$(pwd)
PREFIX="$ROOT/.tools/pg16"
if [ -x "$PREFIX/bin/postgres" ]; then
  "$PREFIX/bin/postgres" --version
  exit 0
fi
python3 - <<'PY'
import hashlib
import pathlib
import tarfile
import urllib.request
base = 'https://ftp.postgresql.org/pub/source/v16.15/'
name = 'postgresql-16.15.tar.bz2'
target = pathlib.Path('.tools/pg-source')
target.mkdir(parents=True, exist_ok=True)
with urllib.request.urlopen(base + name + '.sha256', timeout=30) as response:
    expected = response.read(1024).decode().split()[0]
with urllib.request.urlopen(base + name, timeout=60) as response:
    data = response.read(40 * 1024 * 1024)
if hashlib.sha256(data).hexdigest() != expected:
    raise SystemExit('PostgreSQL source checksum mismatch')
archive = target / name
archive.write_bytes(data)
with tarfile.open(archive) as source:
    members = source.getmembers()
    if sum(m.size for m in members) > 500 * 1024 * 1024:
        raise SystemExit('Unexpected PostgreSQL archive size')
    for member in members:
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise SystemExit('Unsafe PostgreSQL archive member')
    source.extractall(target, members=members)
print('Verified PostgreSQL 16.15 source SHA256', expected)
PY
cd .tools/pg-source/postgresql-16.15
./configure --prefix="$PREFIX" --without-icu --with-openssl > "$ROOT/.tools/pg-configure.log" 2>&1
make -j2 > "$ROOT/.tools/pg-make.log" 2>&1
make install >> "$ROOT/.tools/pg-make.log" 2>&1
"$PREFIX/bin/postgres" --version
