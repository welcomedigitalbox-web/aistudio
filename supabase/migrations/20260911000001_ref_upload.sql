-- Uploaded reference art.
--
-- Generated art drifts because the model reinvents the face each time it is
-- asked. An uploaded reference does not: the same pixels go into every prompt.
-- For a character who already exists -- a real design, a photo, an earlier
-- render someone liked -- uploading beats regenerating.

alter table ref_images add column if not exists uploaded boolean not null default false;

-- A generated image records the prompt that made it; an uploaded one records
-- what the person called it, so the sheet still reads as a set.
alter table ref_images add column if not exists label text;

-- Generated rows carry a model and a cost; uploaded rows carry neither, and
-- the state machine has nothing to wait for.
alter table ref_images alter column state set default 'ready';
