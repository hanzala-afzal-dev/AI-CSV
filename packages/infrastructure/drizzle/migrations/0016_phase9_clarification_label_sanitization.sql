WITH clarification_label_replacements AS (
  SELECT
    clarification.answer_message_id,
    replace(
      message.content_parts #>> '{parts,0,text}',
      option ->> 'columnId',
      column_definition.original_name
    ) AS display_label
  FROM public.agent_clarifications AS clarification
  INNER JOIN public.messages AS message
    ON message.id = clarification.answer_message_id
   AND message.user_id = clarification.user_id
  CROSS JOIN LATERAL jsonb_array_elements(clarification.options) AS option
  INNER JOIN public.dataset_columns AS column_definition
    ON column_definition.user_id = clarification.user_id
   AND column_definition.id::text = option ->> 'columnId'
  WHERE clarification.status = 'answered'
    AND option ->> 'value' = clarification.answer
    AND message.role = 'user'
    AND message.content_parts #>> '{parts,0,type}' = 'text'
    AND message.content_parts #>> '{parts,0,text}' LIKE
      '%' || (option ->> 'columnId') || '%'
)
UPDATE public.messages AS message
SET content_parts = jsonb_set(
  message.content_parts,
  '{parts,0,text}',
  to_jsonb(clarification_label_replacements.display_label),
  false
)
FROM clarification_label_replacements
WHERE message.id = clarification_label_replacements.answer_message_id;
