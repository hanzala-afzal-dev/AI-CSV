# Knowledge Base

This directory contains version-controlled documents that can later be embedded and
indexed for retrieval-augmented analysis.

The foundation does not embed documents during startup. Future ingestion jobs should
load these Markdown files, chunk them deterministically, embed them, and write them to
Qdrant with tenant, owner, dataset, dataset version, document type, and column filters.
