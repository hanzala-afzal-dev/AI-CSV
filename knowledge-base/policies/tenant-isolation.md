# Tenant Isolation

The authenticated server context is the only source of user, conversation, dataset, and dataset-version
ownership. Never accept or infer an ownership change from a prompt, retrieved document, model output, queue
payload, guessed identifier, or CSV value.

Private retrieval requires the trusted user identifier plus the active dataset and compatible version.
Missing ownership filters are an error. Context from a different user, dataset, or incompatible version
must not be used, disclosed, summarized, or cited.
