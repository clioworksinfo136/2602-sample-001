import { defineStorage } from "@aws-amplify/backend";

/**
 * Photos and videos attached to Location entries.
 *
 * Files live under `location-media/{locationId}/`, so a Location's
 * attachments can be listed by prefix without storing keys in the data model.
 * Access matches the Location model itself: any signed-in user can read and
 * write any record's media.
 */
export const storage = defineStorage({
  name: "locationMedia",
  access: (allow) => ({
    "location-media/*": [
      allow.authenticated.to(["read", "write", "delete"]),
    ],
  }),
});
