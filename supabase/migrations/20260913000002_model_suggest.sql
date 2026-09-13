-- A model chosen per shot, not per batch.
--
-- One dropdown for sixty-one shots is the wrong unit: a held object and a
-- person walking want different models, and paying Kling's rate for a candle
-- flame is money spent on nothing.

alter table shots add column if not exists suggested_model  text;
alter table shots add column if not exists suggested_reason text;
alter table shots add column if not exists model_approved   boolean not null default false;
