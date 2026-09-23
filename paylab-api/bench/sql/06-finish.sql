-- Removes everything that is not part of the dataset: the plan table and the load-time index.
DROP TABLE bench_plan;
DROP INDEX bench_load_entries_by_transaction;
