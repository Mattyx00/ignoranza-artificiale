from app.models.base import Base


class HallOfShameEntry(Base):
    __tablename__ = "hall_of_shame_entries"


class ShameUpvote(Base):
    __tablename__ = "shame_upvotes"
