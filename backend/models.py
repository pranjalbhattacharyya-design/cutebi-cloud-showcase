from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON, Float, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    timestamp = Column(DateTime, default=func.now())
    is_deleted = Column(Boolean, default=False)

    
    # Relationships
    folders = relationship("Folder", back_populates="workspace")
    reports = relationship("Report", back_populates="workspace")
    workspace_datasets = relationship("WorkspaceDataset", back_populates="workspace")

class Folder(Base):
    __tablename__ = "folders"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    workspace_id = Column(String, ForeignKey("workspaces.id"))
    parent_id = Column(String, ForeignKey("folders.id"), nullable=True)
    timestamp = Column(DateTime, default=func.now())
    is_deleted = Column(Boolean, default=False)


    # Relationships
    workspace = relationship("Workspace", back_populates="folders")
    parent = relationship("Folder", remote_side=[id], backref="subfolders")
    reports = relationship("Report", back_populates="folder")
    workspace_datasets = relationship("WorkspaceDataset", back_populates="folder")

class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    workspace_id = Column(String, ForeignKey("workspaces.id"), nullable=True)
    folder_id = Column(String, ForeignKey("folders.id"), nullable=True)
    
    # Store all BI metadata (Semantic models, Dashboards, Slicers, etc) as JSON
    data = Column(JSON) 
    
    timestamp = Column(DateTime, default=func.now())
    is_deleted = Column(Boolean, default=False)


    # Relationships
    workspace = relationship("Workspace", back_populates="reports")
    folder = relationship("Folder", back_populates="reports")

class PublishedModel(Base):
    __tablename__ = "published_models"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    workspace_id = Column(String, ForeignKey("workspaces.id"))
    data = Column(JSON) # Stores field definitions, relationships, etc.
    timestamp = Column(DateTime, default=func.now())

    # Relationships
    workspace = relationship("Workspace")

class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    original_file_name = Column(String)
    file_path = Column(String)
    table_name = Column(String)
    headers = Column(JSON)
    timestamp = Column(DateTime, default=func.now())

class WorkspaceDataset(Base):
    __tablename__ = "workspace_datasets"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    workspace_id = Column(String, ForeignKey("workspaces.id"))
    folder_id = Column(String, ForeignKey("folders.id"), nullable=True)
    table_name = Column(String)
    headers = Column(JSON)
    description = Column(String, nullable=True)
    is_deleted = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=func.now())

    # Relationships
    workspace = relationship("Workspace", back_populates="workspace_datasets")
    folder = relationship("Folder", back_populates="workspace_datasets")
