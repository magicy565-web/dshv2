# Grokbot Routine example

Start the overlay with:

```sh
pnpm dsh --profile web --patch apps/cli/config/examples/grokbot/cordis.yml
```

Set `GROKBOT_SHARED_SECRET` in the DSH environment and expose the selected port through an HTTPS reverse proxy. The Grokbot Routine calls `POST /grokbot/claim` with `X-Grokbot-Auth`, executes the cloud-computer steps, then posts `/grokbot/callback` with the same header and an HMAC `X-Grokbot-Signature`.

Keep the returned `callbackToken` in the Routine's private state. Never put the shared secret or callback token in task input or result output.
