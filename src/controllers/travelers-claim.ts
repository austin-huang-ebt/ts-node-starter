import logger from '../util/logger';

type FNOLParams = {
  newEcoFnolId: string;
  currHouseClaimId: string;
  policyNo: string;
  dateOfLoss: string;
  dateOfNotification: string;
  policyholderName: string;
  contact: {
    name: string;
    telephone: string;
  };
  accidentDescription: string;
  accidentAddress: {
    city: string;
    state: string;
    addressLine1: string;
    postCode: string;
  };
};

interface CreatePaymentParams {
  url: string;
  token: string;
  // Add other necessary parameters here
}

const SERVER_URL =
  'https://us-vault-punetst-gw.insuremo.com/aw/1.0/general-claim';

const ORGAN_ID = 1000000000002;

export async function createFNOL(params: FNOLParams) {
  const TRAVELERS_CLAIM_SERVER_TOKEN = process.env.TRAVELERS_CLAIM_SERVER_TOKEN;
  logger.debug(`Travelers Claim Server Token: ${TRAVELERS_CLAIM_SERVER_TOKEN}`);
  const headers = {
    Authorization: `Bearer ${TRAVELERS_CLAIM_SERVER_TOKEN}`,
    'Content-Type': 'application/json',
  };

  try {
    // Step 1: Get Product Tree
    logger.info('Fetching product tree');
    const productTreeResponse = await fetch(
      `${SERVER_URL}/productTree/productLineTree`,
      { headers },
    );
    if (!productTreeResponse.ok) {
      logger.error(
        `Failed to fetch product tree: ${productTreeResponse.status} ${productTreeResponse.statusText}`,
      );
      throw new Error('Failed to fetch product tree');
    }
    const productTreeData = await productTreeResponse.json();
    const productCode = productTreeData.Model[2].id;
    logger.info(`Product code: ${productCode}`);

    // Step 2: Get Product Detail
    logger.info('Fetching product detail');
    const productDetailResponse = await fetch(
      `${SERVER_URL}/product/productDetailByProductCode/${productCode}`,
      { headers },
    );
    if (!productDetailResponse.ok) {
      logger.error(
        `Failed to fetch product detail: ${productDetailResponse.status} ${productDetailResponse.statusText}`,
      );
      throw new Error('Failed to fetch product detail');
    }
    const productDetailData = await productDetailResponse.json();
    const productTypeCode = productDetailData.Model.ProductTypeCode;
    const productDescription = productDetailData.Model.ProductDescription;
    logger.info(
      `Product type code: ${productTypeCode}, Product description: ${productDescription}`,
    );

    // Step 3: Claim Contact Type
    logger.info('Fetching contact types');
    const contactTypeResponse = await fetch(
      `${SERVER_URL}/public/codetable/data/list/1026`,
      { headers },
    );
    if (!contactTypeResponse.ok) {
      logger.error(
        `Failed to fetch contact types: ${contactTypeResponse.status} ${contactTypeResponse.statusText}`,
      );
      throw new Error('Failed to fetch contact types');
    }
    const contactTypeData = (await contactTypeResponse.json()) as Record<
      string,
      unknown
    >[];
    const contactType = contactTypeData.find(
      (d) => d.Description === 'Insured',
    )?.Code;
    logger.info(`Contact type: ${contactType}`);

    // Step 4: FNOL Submit
    logger.info('Submitting FNOL');
    const fnolPayload = {
      '@type': 'ClaimNotice-ClaimNotice',
      AccidentTime: params.dateOfLoss,
      NoticeTime: params.dateOfNotification,
      ProductTypeCode: productTypeCode,
      ProductCode: productCode,
      ProductName: productDescription,
      PolicyNo: params.policyNo,
      PolicyBranch: ORGAN_ID,
      PolicyHolderName: params.policyholderName,
      ContactPerson: params.contact.name,
      ContactTelephone: params.contact.telephone,
      AccidentDescription: params.accidentDescription,
      NoticeStatus: 'CLOSED',
      ContactType: contactType,
      AddressVo: {
        Country: 'US',
        City: params.accidentAddress.city,
        State: params.accidentAddress.state,
        AddressLine1: params.accidentAddress.addressLine1,
        PostCode: params.accidentAddress.postCode,
      },
    };

    const fnolResponse = await fetch(`${SERVER_URL}/notice/creation`, {
      method: 'POST',
      headers,
      body: JSON.stringify(fnolPayload),
    });

    if (!fnolResponse.ok) {
      logger.error(
        `Failed to submit FNOL: ${fnolResponse.status} ${fnolResponse.statusText}`,
      );
      throw new Error('Failed to submit FNOL');
    }
    const fnolData = await fnolResponse.json();
    const caseId = fnolData.Model.CaseIds[0];
    logger.info(`Case ID: ${caseId}`);
    logger.info(`FNOL#: ${fnolData.Model.NoticeNo}`);
    logger.info('FNOL submitted successfully');

    // Step 5: Query Claim Tasks by caseId
    logger.info('Querying claim tasks');
    const claimTasksResponse = await fetch(
      `${SERVER_URL}/workflow/claimTasks/${caseId}/false`,
      { headers },
    );
    if (!claimTasksResponse.ok) {
      logger.error(
        `Failed to query claim tasks: ${claimTasksResponse.status} ${claimTasksResponse.statusText}`,
      );
      throw new Error('Failed to query claim tasks');
    }
    const claimTasksData = await claimTasksResponse.json();
    const claimRegistrationTaskId = claimTasksData.Model.loadClaimTasks[0].id;
    logger.info(`Claim registration task ID: ${claimRegistrationTaskId}`);

    // Step 6: Work on Claim Registration Task
    logger.info('Working on claim registration task');
    const workOnClaimTaskPayload = {
      TaskInstanceId: claimRegistrationTaskId,
      AssignTo: 'pool',
    };
    const workOnTaskResponse = await fetch(
      `${SERVER_URL}/workflow/workOnAssignForPool`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(workOnClaimTaskPayload),
      },
    );
    if (!workOnTaskResponse.ok) {
      logger.error(
        `Failed to work on claim registration task: ${workOnTaskResponse.status} ${workOnTaskResponse.statusText}`,
      );
      throw new Error('Failed to work on claim registration task');
    }

    // Step 7: Retrieve Claim by Task Id
    logger.info('Retrieving claim by task ID');
    const retrieveClaimResponse = await fetch(
      `${SERVER_URL}/claimhandling/caseForm/${claimRegistrationTaskId}/0`,
      { headers },
    );
    if (!retrieveClaimResponse.ok) {
      logger.error(
        `Failed to retrieve claim by task ID: ${retrieveClaimResponse.status} ${retrieveClaimResponse.statusText}`,
      );
      throw new Error('Failed to retrieve claim by task ID');
    }
    const claimCase = await retrieveClaimResponse.json();
    logger.info(`Claim # ${claimCase.ClaimEntity.ClaimNo}`);
    logger.info('Claim retrieved successfully');

    // Step 8: Update Claim Registration
    claimCase.ClaimEntity.ExtClaimNo = `NE:${params.newEcoFnolId};CH:${params.currHouseClaimId}`;
    logger.info(`External Claim #s: ${claimCase.ClaimEntity.ExtClaimNo}`);
    logger.info('Updating claim registration');
    const saveClaimResponse = await fetch(
      `${SERVER_URL}/registration/saveClaim`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(claimCase),
      },
    );
    if (!saveClaimResponse.ok) {
      logger.error(
        `Failed to update claim registration: ${saveClaimResponse.status} ${saveClaimResponse.statusText}`,
      );
      throw new Error('Failed to update claim registration');
    }

    return (await saveClaimResponse.json()).Model.ClaimEntity;
  } catch (error) {
    console.error('Error during FNOL process:', error);
    throw error;
  }
}

export async function createPayment(params: CreatePaymentParams) {
  const headers = {
    Authorization: `Bearer ${params.token}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Search Claim
    const searchClaimBody = JSON.stringify({
      Conditions: {},
      PageNo: 1,
      PageSize: 10,
      FuzzyConditions: { ExtClaimNo: '000' },
      Module: 'ClaimCase',
      SortField: 'LastReviewDate',
      SortType: 'DESC',
      SearchType: 0,
    });

    const searchClaimResponse = await fetch(
      `${params.url}/public/ap00/query/entity`,
      {
        method: 'POST',
        headers,
        body: searchClaimBody,
      },
    );
    const searchClaimData = await searchClaimResponse.json();

    if (searchClaimData.Status !== 'OK') throw new Error('Search Claim failed');
    const caseId = searchClaimData.Results[0].SolrDocs[0].CaseId;

    // 2. Query Claim Tasks by caseId
    const queryClaimTasksResponse = await fetch(
      `${params.url}/workflow/claimTasks/${caseId}/false`,
      {
        method: 'GET',
        headers,
      },
    );
    const queryClaimTasksData = await queryClaimTasksResponse.json();

    if (queryClaimTasksData.Status !== 'OK')
      throw new Error('Query Claim Tasks failed');
    const taskId = queryClaimTasksData.Model.loadClaimTasks[0].id;

    // 3. Retrieve Claim by Task Id
    const retrieveClaimResponse = await fetch(
      `${params.url}/claimhandling/caseForm/${taskId}/0`,
      {
        method: 'GET',
        headers,
      },
    );
    const retrieveClaimData = await retrieveClaimResponse.json();

    if (retrieveClaimData.Status !== 'OK')
      throw new Error('Retrieve Claim by Task Id failed');

    // 4. Add policy to the claim (assumed to be part of request)
    const addPolicyToClaimBody = JSON.stringify(retrieveClaimData.Model); // Using response from previous step
    const addPolicyResponse = await fetch(
      `${params.url}/claimhandling/retrievePolicy/`,
      {
        method: 'POST',
        headers,
        body: addPolicyToClaimBody,
      },
    );
    const addPolicyData = await addPolicyResponse.json();

    if (addPolicyData.Status !== 'OK')
      throw new Error('Add policy to the claim failed');

    // 5-10: The following steps are querying static data (Get Cause of Loss, Get Subclaim Type, etc.)
    const staticDataUrls = [
      `${params.url}/public/codetable/data/list/5`,
      `${params.url}/public/codetable/data/list/6`,
      `${params.url}/public/codetable/data/list/7`,
      `${params.url}/public/codetable/data/list/8`,
      `${params.url}/public/codetable/data/list/9`,
    ];

    for (const url of staticDataUrls) {
      const staticDataResponse = await fetch(url, {
        method: 'GET',
        headers,
      });
      const staticData = await staticDataResponse.json();
      if (staticData.Status !== 'OK')
        throw new Error(`Error querying static data: ${url}`);
    }

    // 11. Claim Registration Submit
    const claimRegistrationBody = JSON.stringify(addPolicyData.Model); // Assuming some modifications from previous steps
    const claimRegistrationResponse = await fetch(
      `${params.url}/claimhandling/submitClaimRegistration`,
      {
        method: 'POST',
        headers,
        body: claimRegistrationBody,
      },
    );
    const claimRegistrationData = await claimRegistrationResponse.json();

    if (claimRegistrationData.Status !== 'OK')
      throw new Error('Claim Registration Submit failed');

    // 12-14: Query Claim Tasks and Work on Claim Settlement Task
    const queryClaimSettlementTasksResponse = await fetch(
      `${params.url}/workflow/claimTasks/${caseId}/false`,
      {
        method: 'GET',
        headers,
      },
    );
    const queryClaimSettlementTasksData =
      await queryClaimSettlementTasksResponse.json();

    if (queryClaimSettlementTasksData.Status !== 'OK')
      throw new Error('Query Claim Settlement Tasks failed');
    const claimSettlementTaskId =
      queryClaimSettlementTasksData.Model.loadClaimTasks[0].id;

    const retrieveSettlementClaimResponse = await fetch(
      `${params.url}/claimhandling/caseForm/${claimSettlementTaskId}/0`,
      {
        method: 'GET',
        headers,
      },
    );
    const retrieveSettlementClaimData =
      await retrieveSettlementClaimResponse.json();

    if (retrieveSettlementClaimData.Status !== 'OK')
      throw new Error('Retrieve Claim Settlement Task failed');

    // 15-18: Load Claim Settlement, Get Payment Method, Get Settlement Partial/Final, Final Settlement Submit
    const paymentMethodResponse = await fetch(
      `${params.url}/public/codetable/data/list/75283381`,
      {
        method: 'GET',
        headers,
      },
    );
    const paymentMethodData = await paymentMethodResponse.json();

    const finalSettlementBody = JSON.stringify({
      SettlementEntity: {
        '@type': 'ClaimSettlement-ClaimSettlement',
        CaseId: caseId,
        ClaimType: 'LOS',
        SettlementPayee: [
          {
            '@type': 'ClaimSettlementPayee-ClaimSettlementPayee',
            PayeeId: '1234', // Replace with actual value
            PayMode: paymentMethodData[0].Code, // Example logic
            SettlementItem: [
              {
                '@type': 'ClaimSettlementItem-ClaimSettlementItem',
                SettleAmount: 100, // Example value, replace with actual
              },
            ],
          },
        ],
      },
    });

    const finalSettlementResponse = await fetch(
      `${params.url}/public/settlement`,
      {
        method: 'POST',
        headers,
        body: finalSettlementBody,
      },
    );
    const finalSettlementData = await finalSettlementResponse.json();

    if (finalSettlementData.Status !== 'OK')
      throw new Error('Final Settlement Submit failed');

    return finalSettlementData;
  } catch (error) {
    console.error('Error during createPayment:', error);
    throw error;
  }
}
