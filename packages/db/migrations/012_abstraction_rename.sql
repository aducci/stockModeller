-- Decision B62 (design/02-model/semantics.md §4.2): the semantic "level" is called "abstraction", so that "level"
-- stays free for a custom property. Stored names follow: the property key semantic.level and its value list
-- semanticLevel wherever they are written (values, field stamps, confirmations, markers, filters, the change log),
-- and the object-type fields level, levelFixed and uniquePerLevel. The values themselves (conceptual, logical,
-- physical, implementation) are unchanged.
UPDATE object SET
  properties     = replace(properties::text, '"semantic.level"', '"semantic.abstraction"')::jsonb,
  field_versions = replace(field_versions::text, '.semantic.level"', '.semantic.abstraction"')::jsonb,
  confirmations  = replace(confirmations::text, '"semantic.level"', '"semantic.abstraction"')::jsonb
WHERE properties::text LIKE '%semantic.level%'
   OR field_versions::text LIKE '%semantic.level%'
   OR confirmations::text LIKE '%semantic.level%';

UPDATE object_type SET definition = (
  SELECT jsonb_object_agg(
    CASE key WHEN 'level' THEN 'abstraction' WHEN 'levelFixed' THEN 'abstractionFixed'
             WHEN 'uniquePerLevel' THEN 'uniquePerAbstraction' ELSE key END,
    value)
  FROM jsonb_each(replace(replace(definition::text, 'semantic.level', 'semantic.abstraction'),
                          '"semanticLevel"', '"semanticAbstraction"')::jsonb)
)
WHERE definition ?| array['level', 'levelFixed', 'uniquePerLevel'] OR definition::text LIKE '%semantic.level%';

UPDATE property_type SET definition = replace(definition::text, '"semanticLevel"', '"semanticAbstraction"')::jsonb
WHERE definition::text LIKE '%"semanticLevel"%';

UPDATE diagram_type SET definition = replace(definition::text, 'semantic.level', 'semantic.abstraction')::jsonb
WHERE definition::text LIKE '%semantic.level%';

UPDATE catalogue SET definition = replace(definition::text, 'semantic.level', 'semantic.abstraction')::jsonb
WHERE definition::text LIKE '%semantic.level%';

UPDATE diagram SET definition = replace(definition::text, 'semantic.level', 'semantic.abstraction')::jsonb
WHERE definition::text LIKE '%semantic.level%';

UPDATE change_log SET
  edit    = replace(edit::text, 'semantic.level', 'semantic.abstraction')::jsonb,
  inverse = replace(inverse::text, 'semantic.level', 'semantic.abstraction')::jsonb
WHERE edit::text LIKE '%semantic.level%' OR inverse::text LIKE '%semantic.level%';
