-- Templates name a main repository and its sub-repositories (#46): a stored
-- worktree workspace becomes repositories, that repository (and its ref) as
-- main and no sub-repositories, in a squadron's templates and blueprint roles
-- and in a built template, so nothing stored holds a workspace common no
-- longer reads (decision 0013).
CREATE FUNCTION pg_temp.repositories_crew(crew JSONB) RETURNS JSONB AS $$
  SELECT CASE
    WHEN crew->'workspace'->>'kind' = 'worktree'
      THEN jsonb_set(crew, '{workspace}', jsonb_build_object('kind', 'repositories', 'main', (crew->'workspace') - 'kind', 'subRepositories', '[]'::jsonb))
    ELSE crew
  END
$$ LANGUAGE SQL IMMUTABLE;

UPDATE "squadrons"
SET "templates" = (
  SELECT jsonb_agg(CASE WHEN template ? 'crew' THEN jsonb_set(template, '{crew}', pg_temp.repositories_crew(template->'crew')) ELSE template END ORDER BY position)
  FROM jsonb_array_elements("templates") WITH ORDINALITY AS each(template, position)
)
WHERE jsonb_path_exists("templates", '$[*].crew.workspace ? (@.kind == "worktree")');

UPDATE "squadrons"
SET "blueprint" = jsonb_set("blueprint", '{roles}', (
  SELECT jsonb_agg(CASE WHEN role ? 'crew' THEN jsonb_set(role, '{crew}', pg_temp.repositories_crew(role->'crew')) ELSE role END ORDER BY position)
  FROM jsonb_array_elements("blueprint"->'roles') WITH ORDINALITY AS each(role, position)
))
WHERE jsonb_path_exists("blueprint", '$.roles[*].crew.workspace ? (@.kind == "worktree")');

UPDATE "built_templates"
SET "template" = jsonb_set("template", '{crew}', pg_temp.repositories_crew("template"->'crew'))
WHERE "template"->'crew'->'workspace'->>'kind' = 'worktree';
