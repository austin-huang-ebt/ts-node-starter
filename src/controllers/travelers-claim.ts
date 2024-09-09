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
