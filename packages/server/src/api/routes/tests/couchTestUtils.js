const CouchDB = require("../../../db")
const supertest = require("supertest")
const { BUILTIN_ROLE_IDS } = require("../../../utilities/security/roles")
const packageJson = require("../../../../package")
const jwt = require("jsonwebtoken")
const env = require("../../../environment")

const TEST_CLIENT_ID = "test-client-id"

exports.TEST_CLIENT_ID = TEST_CLIENT_ID
exports.supertest = async () => {
  let request
  let server
  env.PORT = 4002
  server = require("../../../app")

  request = supertest(server)
  return { request, server }
}

exports.defaultHeaders = appId => {
  const builderUser = {
    userId: "BUILDER",
    roleId: BUILTIN_ROLE_IDS.BUILDER,
  }

  const builderToken = jwt.sign(builderUser, env.JWT_SECRET)

  const headers = {
    Accept: "application/json",
    Cookie: [`budibase:builder:local=${builderToken}`],
  }
  if (appId) {
    headers["x-budibase-app-id"] = appId
  }

  return headers
}

exports.createTable = async (request, appId, table) => {
  if (table != null && table._id) {
    delete table._id
  }
  table = table || {
    name: "TestTable",
    type: "table",
    key: "name",
    schema: {
      name: {
        type: "string",
        constraints: {
          type: "string",
        },
      },
      description: {
        type: "string",
        constraints: {
          type: "string",
        },
      },
    },
  }

  const res = await request
    .post(`/api/tables`)
    .set(exports.defaultHeaders(appId))
    .send(table)
  return res.body
}

exports.getAllFromTable = async (request, appId, tableId) => {
  const res = await request
    .get(`/api/${tableId}/rows`)
    .set(exports.defaultHeaders(appId))
  return res.body
}

exports.createView = async (request, appId, tableId, view) => {
  view = view || {
    map: "function(doc) { emit(doc[doc.key], doc._id); } ",
    tableId: tableId,
  }

  const res = await request
    .post(`/api/views`)
    .set(exports.defaultHeaders(appId))
    .send(view)
  return res.body
}

exports.createApplication = async (request, name = "test_application") => {
  const res = await request
    .post("/api/applications")
    .send({
      name,
    })
    .set(exports.defaultHeaders())
  return res.body
}

exports.clearApplications = async request => {
  const res = await request
    .get("/api/applications")
    .set(exports.defaultHeaders())
  for (let app of res.body) {
    const appId = app._id
    await request
      .delete(`/api/applications/${appId}`)
      .set(exports.defaultHeaders(appId))
  }
}

exports.createUser = async (
  request,
  appId,
  email = "babs@babs.com",
  password = "babs_password"
) => {
  const res = await request
    .post(`/api/users`)
    .set(exports.defaultHeaders(appId))
    .send({
      name: "Bill",
      email,
      password,
      roleId: BUILTIN_ROLE_IDS.POWER,
    })
  return res.body
}

const createUserWithRole = async (request, appId, roleId, email) => {
  const password = `password_${email}`
  await request
    .post(`/api/users`)
    .set(exports.defaultHeaders(appId))
    .send({
      email,
      password,
      roleId,
    })

  const anonUser = {
    userId: "ANON",
    roleId: BUILTIN_ROLE_IDS.PUBLIC,
    appId: appId,
    version: packageJson.version,
  }

  const anonToken = jwt.sign(anonUser, env.JWT_SECRET)

  const loginResult = await request
    .post(`/api/authenticate`)
    .set({
      Cookie: `budibase:${appId}:local=${anonToken}`,
      "x-budibase-app-id": appId,
    })
    .send({ email, password })

  // returning necessary request headers
  return {
    Accept: "application/json",
    Cookie: loginResult.headers["set-cookie"],
  }
}

exports.testPermissionsForEndpoint = async ({
  request,
  method,
  url,
  body,
  appId,
  passRole,
  failRole,
}) => {
  const passHeader = await createUserWithRole(
    request,
    appId,
    passRole,
    "passUser@budibase.com"
  )

  await createRequest(request, method, url, body)
    .set(passHeader)
    .expect(200)

  const failHeader = await createUserWithRole(
    request,
    appId,
    failRole,
    "failUser@budibase.com"
  )

  await createRequest(request, method, url, body)
    .set(failHeader)
    .expect(403)
}

exports.builderEndpointShouldBlockNormalUsers = async ({
  request,
  method,
  url,
  body,
  appId,
}) => {
  const headers = await createUserWithRole(
    request,
    appId,
    BUILTIN_ROLE_IDS.BASIC,
    "basicUser@budibase.com"
  )

  await createRequest(request, method, url, body)
    .set(headers)
    .expect(403)
}

const createRequest = (request, method, url, body) => {
  let req

  if (method === "POST") req = request.post(url).send(body)
  else if (method === "GET") req = request.get(url)
  else if (method === "DELETE") req = request.delete(url)
  else if (method === "PATCH") req = request.patch(url).send(body)
  else if (method === "PUT") req = request.put(url).send(body)

  return req
}

exports.insertDocument = async (databaseId, document) => {
  const { id, ...documentFields } = document
  return await new CouchDB(databaseId).put({ _id: id, ...documentFields })
}

exports.destroyDocument = async (databaseId, documentId) => {
  return await new CouchDB(databaseId).destroy(documentId)
}

exports.getDocument = async (databaseId, documentId) => {
  return await new CouchDB(databaseId).get(documentId)
}
