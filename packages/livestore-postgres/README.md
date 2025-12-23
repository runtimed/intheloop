# @runtimed/livestore-postgres

This package provides PostgreSQL-backed synchronization for LiveStore, adapted from the `@livestore/sync-cf` package tagged at 0.3.1.

## Origin

Code adapted from the `@livestore/sync-cf` package:

https://github.com/livestorejs/livestore/tree/v0.3.1/packages/%40livestore/sync-cf

## Key Changes

The main function `makeDurableObject` from the original package was renamed to `makePostgres` and heavily modified to support PostgreSQL on the backend instead of Cloudflare Durable Objects. The implementation now uses PostgreSQL for event storage and synchronization, replacing the Durable Object storage mechanism.

It still uses the `DurableObject` class from `cloudflare:workers`.

## License

Copyright 2025 Overengineering Studio

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
