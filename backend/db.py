"""MongoDB connection shared across backend modules."""
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

# Fixed identifiers for the single synthetic demonstration organization.
DEMO_ORG_ID = "org-tugma-demo-psp"
