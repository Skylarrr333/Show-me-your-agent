# External HDB historical dataset

**The Kaggle dataset is not included in this repository.** On 27 September 2026, `data/hdb/kaggle-v1.zip` was removed from the working tree and rewritten Git branch history. Only this source manifest remains in `data/hdb/`. See the [cleanup record and contributor instructions](../../README.md#dataset-removal-and-git-history-cleanup--27-september-2026).

- Source: [HDB resale pricing (Singapore), yingghui233 / Kaggle](https://www.kaggle.com/datasets/yingghui233/hdb-resale-pricing-singapore)
- Downloaded 26 September 2026 through Kaggle's public dataset download API, **version 1**.
- Expected external archive (not included): `kaggle-v1.zip` (2.9 MB compressed); one CSV, `INET4061projectdata(housing_price).csv`.
- CSV SHA-256: `7b92e29f72ba4167e298e9e1cc1124839b025ebbfa3652622fbeb6eb966189af`.
- Independently imported: **228,225 rows**, **26 towns**, **January 2017–April 2026**. The final month may be incomplete.
- Kaggle API license label at download: **Unknown**. No additional license is asserted by this project. Obtain the archive separately from Kaggle after reviewing the source's permissions; this repository does not redistribute it or grant permission for public redistribution or commercial reuse.

To import locally, obtain **version 1** from the source above and place it at `data/hdb/kaggle-v1.zip` (ignored by Git), then run `npm run data:hdb` (Python 3.10+, standard library only). A different version may fail the checksum check. The command verifies the CSV checksum before import, rebuilds the historical `resales` table and indexed representative `homes` table, and writes `.propmatch-data/hdb-resales.sqlite`. Docker performs this import in a separate build stage and includes the read-only database in the image. Its build context must contain your separately supplied archive. Dataset-dependent CI likewise needs authorized external provisioning before import; a fresh checkout does not contain the required input.

The archive is input data, never executable code. This is **historical transaction data**, not an inventory feed. A grouped record describes an address, flat type, storey band, size, model and lease start, not an identified physical unit. Its latest transaction supplies a **historical reference price**. There is no real seller, asking price, current availability, unit number, bedroom count, photograph, commute, or amenity record in the CSV. Real map lookups are separate from simulated listing availability. The source zip is not served as a public asset.
