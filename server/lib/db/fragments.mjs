// SQL fragments that cannot be written portably. Everything else goes through the
// mechanical translation in translate.mjs. The dialect is read lazily because the
// db scripts set DATABASE_URL after module load.

export function createFragments(getDialect) {
  const pick = (postgres, sqlite) => (getDialect() === 'sqlite' ? sqlite : postgres);

  return {
    // Seconds elapsed since the timestamp in `column`.
    ageSeconds: (column) => pick(`extract(epoch from now() - ${column})`, `(julianday('now') - julianday(${column})) * 86400`),

    // Relevance of the (already lowercased) parameter `ref` within `expression`; higher is
    // better. Postgres uses trigram similarity; SQLite falls back to match position.
    similarity: (expression, ref) =>
      pick(
        `similarity(${expression}, ${ref})`,
        `case when instr(${expression}, ${ref}) > 0 then 1.0 / instr(${expression}, ${ref}) else 0 end`
      ),

    // Conflict target of the entity_relations uniqueness rule. Postgres uses a
    // `nulls not distinct` index; SQLite an expression index over coalesce.
    relationConflictTarget: () =>
      pick(
        `(subject_entity_id, predicate, object_entity_id, source_document_id)`,
        `(subject_entity_id, predicate, object_entity_id, coalesce(source_document_id, ''))`
      ),

    // Aggregates entity_aliases rows (alias `a`, left-joined) into an array.
    aliasList: () =>
      pick(
        `coalesce(array_agg(a.alias) filter (where a.alias is not null), '{}')`,
        `coalesce(json_group_array(a.alias) filter (where a.alias is not null), '[]')`
      ),

    // Flattens the quantities of the usage rows matching mention `m` into one JSON array.
    mentionQuantities: () =>
      pick(
        `coalesce(
          (select jsonb_agg(q) from document_usages du, jsonb_array_elements(du.quantities) q
            where du.document_id = m.document_id and du.target_id = m.target_id),
          '[]'::jsonb
        )`,
        `coalesce(
          (select json_group_array(json(q.value)) from document_usages du, json_each(du.quantities) q
            where du.document_id = m.document_id and du.target_id = m.target_id),
          '[]'
        )`
      )
  };
}
