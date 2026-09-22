from alembic import context

from app.config import Settings
from app.db import Database
from app.models import Base

configuration = context.config


def run(connection):
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    raise RuntimeError("Use the controlled online migration procedure")
else:
    supplied = configuration.attributes.get("connection")
    if supplied is not None:
        run(supplied)
    else:
        database = Database(Settings())
        if database.engine is None:
            raise RuntimeError("DATABASE_URL is required for migration")
        try:
            with database.engine.connect() as connection:
                run(connection)
        finally:
            database.close()
