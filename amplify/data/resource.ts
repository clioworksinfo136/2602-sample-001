import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/*== SCHEMA ===============================================================
Creates the Location, Date, Type, Track, and Equipment tables. The
authorization rules below specify that any signed-in user (Cognito user
pool) can "create", "read", "update", and "delete" any record.
=========================================================================*/
const schema = a.schema({
    Location: a
    .model({
      date: a.date().required(),
      time: a.time(),
      track: a.integer().required(),
      type: a.string(),
      username: a.string(),
      description: a.string(),
    })
    .authorization((allow) => [allow.authenticated()]),

  Date: a
    .model({
      date: a.date(),
      weather: a.string(),
      hight: a.float(),
      lowt: a.float(),
      supervisor: a.string(),
      inspector: a.string(),
      labor: a.integer(),
      observation: a.string(),
      equipment: a.string(),
    })
    .authorization((allow) => [allow.authenticated()]),

  Type: a
    .model({
      typeid: a.string(),
      type: a.string(),
    })
    .authorization((allow) => [allow.authenticated()]),

  // typeid is a soft link to Type.typeid, matching how Location.type stores a
  // typeid. It is not an enforced foreign key: Amplify relationships reference
  // a model's primary key (id), and typeid is an ordinary field.
  Track: a
    .model({
      track: a.integer(),
      typeid: a.string(),
    })
    .authorization((allow) => [allow.authenticated()]),

  // "prime/sub" cannot be a GraphQL field name (identifiers allow only
  // letters, digits, and underscores), so the slash becomes camelCase here.
  Equipment: a
    .model({
      primeSub: a.string(),
      model: a.string(),
      equipment: a.string(),
    })
    .authorization((allow) => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // Every model uses allow.authenticated(), so requests are authorized with
    // the signed-in user's Cognito user pool token. No API key is issued.
    defaultAuthorizationMode: "userPool",
  },
});

/*== STEP 2 ===============================================================
Go to your frontend source code. From your client-side code, generate a
Data client to make CRUDL requests to your table. (THIS SNIPPET WILL ONLY
WORK IN THE FRONTEND CODE FILE.)

Using JavaScript or Next.js React Server Components, Middleware, Server 
Actions or Pages Router? Review how to generate Data clients for those use
cases: https://docs.amplify.aws/gen2/build-a-backend/data/connect-to-API/
=========================================================================*/

/*
"use client"
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>() // use this Data client for CRUDL requests
*/

/*== STEP 3 ===============================================================
Fetch records from the database and use them in your frontend component.
(THIS SNIPPET WILL ONLY WORK IN THE FRONTEND CODE FILE.)
=========================================================================*/

/* For example, in a React component, you can use this snippet in your
  function's RETURN statement */
// const { data: todos } = await client.models.Todo.list()

// return <ul>{todos.map(todo => <li key={todo.id}>{todo.content}</li>)}</ul>
