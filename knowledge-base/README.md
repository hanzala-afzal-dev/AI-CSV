# Knowledge Base

This directory contains reviewed, version-controlled agent policies and future public analytical
reference material.

The worker loads only the explicit policy allowlist exported by the agent package. Policies are bounded
trusted system context and are not copied into tenant vector namespaces. Adding a Markdown file does not
automatically make it trusted; the allowlist and agent tests must be updated in the same review.

Private dataset descriptions, column profiles, and confirmed definitions are created from authoritative
PostgreSQL records and indexed asynchronously. They are never loaded from this folder and are always
retrieved with trusted tenant, dataset, and compatible-version filters.
