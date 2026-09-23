process.env.APP_NAME ??= 'paylab-api'
process.env.NODE_ENV ??= 'test'
process.env.PORT ??= '3333'
// No database is contacted until T3; the value only has to satisfy the env schema.
process.env.DATABASE_URL ??= 'postgresql://paylab:paylab@localhost:5432/paylab_test'
