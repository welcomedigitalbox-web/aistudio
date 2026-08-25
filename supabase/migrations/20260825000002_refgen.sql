-- Reference image generation :: track in-flight jobs so a webhook can find
-- the row it belongs to, and record which angle each image was asked for.

alter table ref_images add column if not exists provider_job_id text;
alter table ref_images add column if not exists state text not null default 'queued';
alter table ref_images add column if not exists error text;

create index if not exists ref_images_job_idx on ref_images(provider_job_id);
create index if not exists ref_images_state_idx on ref_images(state);

-- storage_key is only known once the webhook lands, so it cannot be NOT NULL
-- while a job is still running.
alter table ref_images alter column storage_key drop not null;

-- The seed that produced the chosen image. Reusing it across angles is the
-- cheapest consistency lever available before you reach for LoRA training.
alter table refs add column if not exists seed bigint;
