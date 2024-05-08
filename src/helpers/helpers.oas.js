function getRequestParameters(endpoint, api) {
  let parameters = { query: [], body: [], path: [], cookie: [], header: [] };
  parameters.body = extractRequestBodyDetails(endpoint, api); // Extract requestBody details
  //console.log("After extractRequestBodyDetails:", parameters.body); // Log the body after extraction
  if (endpoint.parameters) {
    endpoint.parameters.forEach((param) => {
      switch (param.in) {
        case "query":
          parameters.query.push(param);
          break;
        case "body":
          // This case may not be necessary for OpenAPI 3.0 as 'body' parameters are replaced by 'requestBody'.
          parameters.body.push(param);
          break;
        case "path":
          parameters.path.push(param);
          break;
        case "cookie":
          parameters.cookie.push(param);
          break;
        case "header":
          parameters.header.push(param);
          break;
      }
    });
  }
  return parameters;
}

function resolveRef(oas, ref) {
  const parts = ref.replace(/^#\//, "").split("/");
  let currentPart = oas;
  for (const part of parts) {
    currentPart = currentPart[part];
  }
  //console.log("Resolved $ref:", currentPart); // Log the resolved reference
  return currentPart;
}

function extractSchemaProperties(schema, parameters, oas) {
  if (schema.properties) {
    //console.log("Schema has properties:", Object.keys(schema.properties)); // Log properties keys
    for (const propName in schema.properties) {
      const prop = schema.properties[propName];
      parameters.push({
        name: propName,
        schema: { type: prop.type },
        description: prop.description || "No description available",
      });
    }
  } else if (schema.$ref) {
    //console.log("Schema has $ref:", schema.$ref); // Log $ref
    const resolvedSchema = resolveRef(oas, schema.$ref);
    extractSchemaProperties(resolvedSchema, parameters, oas);
  } else {
    //console.log("Schema does not have properties or $ref:", schema); // Log unexpected schema format
  }
}

function extractRequestBodyDetails(endpoint, oas) {
  let parameters = [];
  //console.log("Extracting requestBody details"); // Initial log

  if (endpoint.requestBody && endpoint.requestBody.content) {
    /*console.log(
        "Endpoint has requestBody:",
        Object.keys(endpoint.requestBody.content)
      ); // Log content types
      */
    for (const contentType in endpoint.requestBody.content) {
      const content = endpoint.requestBody.content[contentType];
      let schema = content.schema;
      if (schema) {
        //console.log("Processing schema for contentType:", contentType); // Log content type being processed
        extractSchemaProperties(schema, parameters, oas);
      } else {
        //console.log("No schema found for contentType:", contentType); // Log missing schema
      }
    }
  } else {
    //console.log("No requestBody content found"); // Log if requestBody or its content is missing
  }

  return parameters;
}

function getResponseParameters(endpoint, oas) {
  let responseParameters = {
    "Status Codes": [],
    headers: [], // This will aggregate headers from all responses
    // Bodies are added dynamically below based on status codes
  };

  // Dynamically add body keys based on status codes
  Object.keys(endpoint.responses).forEach((statusCode) => {
    responseParameters[`body (${statusCode})`] = []; // Initialize array for body parameters per status code
  });

  // Loop over all response codes to fill in the details
  Object.keys(endpoint.responses).forEach((statusCode) => {
    const response = endpoint.responses[statusCode];
    let statusCodeDetail = {
      name: statusCode,
      schema: { type: null }, // Initialize as null; replace as needed
      description: response.description || null,
    };

    // Extract body parameters if applicable
    if (response.content) {
      Object.keys(response.content).forEach((contentType) => {
        const content = response.content[contentType];
        if (content.schema) {
          // Directly use the status code to categorize body parameters
          extractSchemaProperties(
            content.schema,
            responseParameters[`body (${statusCode})`],
            oas
          );
          statusCodeDetail.schema.type = "null"; // Detail the response type, e.g., for a successful response
        }
      });
    }

    // Extract headers
    if (response.headers) {
      Object.keys(response.headers).forEach((headerName) => {
        const header = response.headers[headerName];
        let schema = header.schema ? header.schema : {};
        let description = header.description
          ? header.description
          : "No description available";

        // If the header schema is a $ref, resolve it
        if (schema.$ref) {
          schema = resolveRef(oas, schema.$ref);
        }

        responseParameters.headers.push({
          name: headerName,
          schema: { type: schema.type },
          description: description,
        });
      });
    }

    responseParameters["Status Codes"].push(statusCodeDetail);
  });

  return responseParameters;
}

module.exports = {
  getRequestParameters,
  getResponseParameters,
};
