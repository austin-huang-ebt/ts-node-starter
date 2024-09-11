import _ from 'lodash';
import logger from '../util/logger';
import TRAVELERS_CLAIM_POLICY_TEMPLATE from './travelers-claim-policy-template';

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
  newEcoFnolId: string;
  causeOfLoss: string;
  damageType: string;
  subclaimType: string;
  estimatedLoss: number;
  litigation?: string;
  totalLoss?: string;
  hasSubrogation?: string;
  hasSalvage?: string;
  damageParty: string;
  damageObject: string;
  claimOwner: string;
  coverageName: string;
  initLossIndemnity: number;
  paymentMethod: string;
  paymentType: string;
  partialFinalOption?: string;
  settleAmount: number;
}

const SERVER_URL =
  'https://us-vault-punetst-gw.insuremo.com/aw/1.0/general-claim';

const ORGAN_ID = 1000000000002;
const PRODUCT_LINE_CODE = '1';

function getHeaders() {
  const TRAVELERS_CLAIM_SERVER_TOKEN = process.env.TRAVELERS_CLAIM_SERVER_TOKEN;
  logger.debug(`Travelers Claim Server Token: ${TRAVELERS_CLAIM_SERVER_TOKEN}`);
  const headers = {
    Authorization: `Bearer ${TRAVELERS_CLAIM_SERVER_TOKEN}`,
    'Content-Type': 'application/json',
  };
  return headers;
}

export async function queryCurrentHouseId(params: FNOLParams) {
  return await queryByNewEcoId(params.newEcoFnolId, 1, getHeaders());
}

export async function createFNOL(params: FNOLParams) {
  const headers = getHeaders();

  // check if the newEcoFnolId exists in the system
  await queryByNewEcoId(params.newEcoFnolId, 0, headers);

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
}

export async function createPayment(params: CreatePaymentParams) {
  const headers = getHeaders();

  // 1. Search Claim
  const { CaseId: caseId, currHouseClaimId } = await queryByNewEcoId(
    params.newEcoFnolId,
    1,
    headers,
  );

  // 2. Query Claim Tasks by caseId
  logger.info('Querying claim tasks');
  const queryClaimTasksResponse = await fetch(
    `${SERVER_URL}/workflow/claimTasks/${caseId}/false`,
    {
      method: 'GET',
      headers,
    },
  );
  if (!queryClaimTasksResponse.ok) {
    logger.error(
      `Failed to query claim tasks: ${queryClaimTasksResponse.status} ${queryClaimTasksResponse.statusText}`,
    );
    throw new Error('Query Claim Tasks failed');
  }
  const queryClaimTasksData = await queryClaimTasksResponse.json();

  if (queryClaimTasksData.Status !== 'OK') {
    logger.error(`Failed to query claim tasks: ${queryClaimTasksData}`);
    throw new Error('Query Claim Tasks failed');
  }
  const taskId = queryClaimTasksData.Model.loadClaimTasks[0].id;
  logger.info(`Task ID: ${taskId}`);

  // 3. Retrieve Claim by Task Id
  logger.info('Retrieving claim by task ID');
  const retrieveClaimResponse = await fetch(
    `${SERVER_URL}/claimhandling/caseForm/${taskId}/0`,
    {
      method: 'GET',
      headers,
    },
  );
  if (!retrieveClaimResponse.ok) {
    logger.error(
      `Failed to retrieve claim by task ID: ${retrieveClaimResponse.status} ${retrieveClaimResponse.statusText}`,
    );
    throw new Error('Retrieve Claim by Task Id failed');
  }
  let claimCase = await retrieveClaimResponse.json();
  logger.info(`Claim # ${claimCase.ClaimEntity.ClaimNo}`);

  // 4. Add policy to the claim (assumed to be part of request)
  logger.info('Adding policy to the claim');
  const policy = JSON.parse(JSON.stringify(TRAVELERS_CLAIM_POLICY_TEMPLATE));
  policy.caseId = caseId;
  claimCase.ClaimEntity.PolicyEntity = policy;
  const addPolicyToClaimBody = JSON.stringify(claimCase);
  const addPolicyResponse = await fetch(
    `${SERVER_URL}/claimhandling/retrievePolicy/`,
    {
      method: 'POST',
      headers,
      body: addPolicyToClaimBody,
    },
  );
  if (!addPolicyResponse.ok) {
    logger.error(
      `Failed to add policy to the claim: ${addPolicyResponse.status} ${addPolicyResponse.statusText}`,
    );
    throw new Error('Add policy to the claim failed');
  }
  const addPolicyData = await addPolicyResponse.json();

  if (addPolicyData.Status !== 'OK') {
    logger.error(`Failed to add policy to the claim: ${addPolicyData}`);
    throw new Error('Add policy to the claim failed');
  }
  claimCase.ClaimEntity = addPolicyData.Model;

  // 5. Get Cause of Loss
  logger.info('Getting Cause of Loss');
  const getCauseOfLossBody = JSON.stringify({
    PRODUCT_LINE_CODE,
  });
  const getCauseOfLossResponse = await fetch(
    `${SERVER_URL}/public/codetable/data/condition/1006`,
    {
      method: 'POST',
      headers,
      body: getCauseOfLossBody,
    },
  );
  if (!getCauseOfLossResponse.ok) {
    logger.error(
      `Failed to get Cause of Loss: ${getCauseOfLossResponse.status} ${getCauseOfLossResponse.statusText}`,
    );
    throw new Error('Get Cause of Loss failed');
  }
  const getCauseOfLossData = (await getCauseOfLossResponse.json()) as Record<
    string,
    unknown
  >[];
  const causeOfLoss = getCauseOfLossData.find(
    (d) => d.Description === params.causeOfLoss,
  )!.Code;
  logger.info(`Cause of Loss: ${causeOfLoss}`);

  // 6. Get Subclaim Type
  logger.info('Getting Subclaim Type');
  const getSubclaimTypeBody = JSON.stringify({
    PRODUCT_LINE_CODE,
  });
  const getSubclaimTypeResponse = await fetch(
    `${SERVER_URL}/public/codetable/data/condition/1007`,
    {
      method: 'POST',
      headers,
      body: getSubclaimTypeBody,
    },
  );
  if (!getSubclaimTypeResponse.ok) {
    logger.error(
      `Failed to get Subclaim Type: ${getSubclaimTypeResponse.status} ${getSubclaimTypeResponse.statusText}`,
    );
    throw new Error('Get Subclaim Type failed');
  }
  const getSubclaimTypeData = (await getSubclaimTypeResponse.json()) as Record<
    string,
    unknown
  >[];
  const subclaimType = getSubclaimTypeData.find(
    (d) => d.Description === params.subclaimType,
  )!.Code;
  logger.info(`Subclaim Type: ${subclaimType}`);

  // 7. Get Damage Type
  logger.info('Getting Damage Type');
  const getDamageTypeBody = JSON.stringify({
    PRODUCT_LINE_CODE,
  });
  const getDamageTypeResponse = await fetch(
    `${SERVER_URL}/public/codetable/data/condition/1027`,
    {
      method: 'POST',
      headers,
      body: getDamageTypeBody,
    },
  );
  if (!getDamageTypeResponse.ok) {
    logger.error(
      `Failed to get Damage Type: ${getDamageTypeResponse.status} ${getDamageTypeResponse.statusText}`,
    );
    throw new Error('Get Damage Type failed');
  }
  const getDamageTypeData = (await getDamageTypeResponse.json()) as Record<
    string,
    unknown
  >[];
  const damageType = getDamageTypeData.find(
    (d) => d.Description === params.damageType,
  )!.Code;
  logger.info(`Damage Type: ${damageType}`);

  // 8. Get Damage Severity
  logger.info('Getting Damage Severity');
  const getDamageSeverityBody = JSON.stringify({
    PRODUCT_LINE_CODE,
  });
  const getDamageSeverityResponse = await fetch(
    `${SERVER_URL}/public/codetable/data/condition/1050`,
    {
      method: 'POST',
      headers,
      body: getDamageSeverityBody,
    },
  );
  if (!getDamageSeverityResponse.ok) {
    logger.error(
      `Failed to get Damage Severity: ${getDamageSeverityResponse.status} ${getDamageSeverityResponse.statusText}`,
    );
    throw new Error('Get Damage Severity failed');
  }
  const getDamageSeverityData =
    (await getDamageSeverityResponse.json()) as Record<string, unknown>[];
  const damageSeverityList = getDamageSeverityData;
  logger.info(`Damage Severity List length: ${damageSeverityList.length}`);

  // 9. Get Damage Severity Threshold
  logger.info('Getting Damage Severity Threshold');
  const getDamageSeverityThresholdBody = JSON.stringify({
    PRODUCT_LINE_CODE,
  });
  const getDamageSeverityThresholdResponse = await fetch(
    `${SERVER_URL}/public/codetable/data/condition/74915434`,
    {
      method: 'POST',
      headers,
      body: getDamageSeverityThresholdBody,
    },
  );
  if (!getDamageSeverityThresholdResponse.ok) {
    logger.error(
      `Failed to get Damage Severity Threshold: ${getDamageSeverityThresholdResponse.status} ${getDamageSeverityThresholdResponse.statusText}`,
    );
    throw new Error('Get Damage Severity Threshold failed');
  }
  const getDamageSeverityThresholdData =
    (await getDamageSeverityThresholdResponse.json()) as Record<
      string,
      unknown
    >[];

  const mediumLoss = parseFloat(
    getDamageSeverityThresholdData.find((d) => d.Description === 'MediumLoss')!
      .Code as string,
  );
  const highLoss = parseFloat(
    getDamageSeverityThresholdData.find((d) => d.Description === 'HighLoss')!
      .Code as string,
  );

  let damageSeverity = '';
  if (params.estimatedLoss < mediumLoss) {
    damageSeverity = damageSeverityList.find((d) => d.Description === 'Small')!
      .Code as string;
  } else if (params.estimatedLoss < highLoss) {
    damageSeverity = damageSeverityList.find((d) => d.Description === 'Medium')!
      .Code as string;
  } else {
    damageSeverity = damageSeverityList.find((d) => d.Description === 'High')!
      .Code as string;
  }
  logger.info(`Damage Severity: ${damageSeverity}`);

  // 10. Filter Selectable Coverage List (assumed logic as per the context)
  logger.info('Filtering Selectable Coverage List');
  const insuredId = claimCase.ClaimEntity.PolicyEntity.InsuredList[0]['@pk'];
  const coverageListUrl = `${SERVER_URL}/claimhandling/subclaim/coverageList/${subclaimType}/${claimCase.ClaimEntity.ProductCode}/${insuredId}`;
  const filterCoverageListResponse = await fetch(coverageListUrl, {
    method: 'GET',
    headers,
  });
  if (!filterCoverageListResponse.ok) {
    logger.error(
      `Failed to filter Selectable Coverage List: ${filterCoverageListResponse.status} ${filterCoverageListResponse.statusText}`,
    );
    throw new Error('Filter Selectable Coverage List failed');
  }
  const coverageListData = await filterCoverageListResponse.json();
  if (coverageListData.Status !== 'OK') {
    logger.error(
      `Failed to filter Selectable Coverage List: ${coverageListData}`,
    );
    throw new Error('Filter Selectable Coverage List failed');
  }
  const coverageList = coverageListData.Model as Record<string, unknown>[];
  logger.info(`Coverage List length: ${coverageList.length}`);

  // 11. Claim Registration Submit
  logger.info('Submitting Claim Registration');
  // tell back-end what is changed
  claimCase.ClaimData.ObjectDatas = [
    {
      IsActive: 'Y',
      Name: '001',
      newSubclaim: true,
    },
  ];

  // set up ClaimEntity level fields
  claimCase.ClaimEntity.PolicyholderId =
    claimCase.ClaimEntity.PolicyHolderParty.PtyPartyId;
  claimCase.ClaimEntity.PolicyholderName =
    claimCase.ClaimEntity.PolicyHolderParty.PartyName;
  claimCase.ClaimEntity.TotalAmount = 0;

  // cause of loss shall be from test data or user data entry
  claimCase.ClaimEntity.LossCause = causeOfLoss;

  // compose subclaim
  const subclaim: Record<string, unknown> = {
    '@type': 'ClaimObject-ClaimObject',
    SeqNo: '001',
    LitigationFlag: params.litigation ?? 'N',
    TotalLossFlag: params.totalLoss ?? 'N',
    IsSubrogation: params.hasSubrogation ?? 'N',
    IsSalvage: params.hasSalvage ?? 'N',
    EstimatedLossCurrency: 'USD',
    SubclaimType: subclaimType,
    DamageType: damageType,
    damageParty: params.damageParty,
    RiskName: params.damageObject,
    EstimatedLossAmount: params.estimatedLoss,
    DamageSeverity: damageSeverity,
  };
  logger.info(`Subclaim: ${JSON.stringify(subclaim)}`);

  subclaim.ClaimParty = claimCase.ClaimEntity.ClaimPartyList[0];
  subclaim.ClaimantId = claimCase.ClaimEntity.ClaimPartyList[0]['@pk'];
  subclaim.InsuredId = claimCase.ClaimEntity.PolicyEntity.InsuredList[0]['@pk'];

  // owner of subclaim
  const ownerList = claimCase.ClaimEntity.OwnerList as Record<
    string,
    unknown
  >[];
  const owner = ownerList.find((o) => o.RealName === params.claimOwner)!;
  subclaim.OwnerId = owner.UserId;

  subclaim.AccidentAddress1 = `${claimCase.ClaimEntity.AddressVo.AddressLine1}, ${claimCase.ClaimEntity.AddressVo.City}, ${claimCase.ClaimEntity.AddressVo.State} ${claimCase.ClaimEntity.AddressVo.PostCode}`;

  // select coverage
  subclaim.PolicyCoverageList = coverageList;
  // find the coverage to be claimed
  const coverage = (
    subclaim.PolicyCoverageList as Record<string, unknown>[]
  ).find((cov) => cov.CoverageName === params.coverageName)!;
  // select the coverage
  coverage.Selected = '1';
  // initial reserve
  coverage.InitLossIndemnity = params.initLossIndemnity;
  coverage.ItemCurrencyCode = 'USD';

  // attach subclaim to claim
  claimCase.ClaimEntity.ObjectList = [subclaim];
  logger.info('Claim Case composed, calling API now');

  const claimRegistrationResponse = await fetch(
    `${SERVER_URL}/registration/submitClaim`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(claimCase),
    },
  );
  if (!claimRegistrationResponse.ok) {
    logger.error(
      `Failed to submit Claim Registration: ${claimRegistrationResponse.status} ${claimRegistrationResponse.statusText}`,
    );
    throw new Error('Claim Registration Submit failed');
  }
  const claimRegistrationData = await claimRegistrationResponse.json();

  if (claimRegistrationData.Status !== 'OK') {
    logger.error(
      `Failed to submit Claim Registration: ${claimRegistrationData}`,
    );
    throw new Error('Claim Registration Submit failed');
  }

  claimCase = claimRegistrationData.Model;
  logger.info(
    `Claim # ${claimCase.ClaimEntity.ClaimNo} registered successfully`,
  );

  // 12: Query Claim Tasks
  logger.info('Querying Claim Settlement Tasks');
  const queryClaimSettlementTasksResponse = await fetch(
    `${SERVER_URL}/workflow/claimTasks/${caseId}/false`,
    {
      method: 'GET',
      headers,
    },
  );
  if (!queryClaimSettlementTasksResponse.ok) {
    logger.error(
      `Failed to query Claim Settlement Tasks: ${queryClaimSettlementTasksResponse.status} ${queryClaimSettlementTasksResponse.statusText}`,
    );
    throw new Error('Query Claim Settlement Tasks failed');
  }
  const queryClaimSettlementTasksData =
    await queryClaimSettlementTasksResponse.json();

  if (queryClaimSettlementTasksData.Status !== 'OK') {
    logger.error(
      `Failed to query Claim Settlement Tasks: ${queryClaimSettlementTasksData}`,
    );
    throw new Error('Query Claim Settlement Tasks failed');
  }
  const claimSettlementTaskId =
    queryClaimSettlementTasksData.Model.loadClaimTasks[0].id;
  logger.info(`Claim Settlement Task ID: ${claimSettlementTaskId}`);

  // 13. Work on Claim Settlement Task
  logger.info('Working on claim settlement task');
  const workOnClaimTaskPayload = {
    TaskInstanceId: claimSettlementTaskId,
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
      `Failed to work on claim settlement task: ${workOnTaskResponse.status} ${workOnTaskResponse.statusText}`,
    );
    throw new Error('Failed to work on claim settlement task');
  }
  logger.info('Claim Settlement Task worked on successfully');

  // 14. Retrieve Claim Settlement Task
  logger.info('Retrieving Claim Settlement Task');
  const retrieveSettlementClaimResponse = await fetch(
    `${SERVER_URL}/claimhandling/caseForm/${claimSettlementTaskId}/0`,
    {
      method: 'GET',
      headers,
    },
  );
  if (!retrieveSettlementClaimResponse.ok) {
    logger.error(
      `Failed to retrieve Claim Settlement Task: ${retrieveSettlementClaimResponse.status} ${retrieveSettlementClaimResponse.statusText}`,
    );
    throw new Error('Retrieve Claim Settlement Task failed');
  }
  claimCase = await retrieveSettlementClaimResponse.json();

  // 15. Load Claim Settlement
  logger.info('Loading Claim Settlement');
  const loadClaimSettlementResponse = await fetch(
    `${SERVER_URL}/settlement/load/${claimSettlementTaskId}`,
    {
      method: 'GET',
      headers,
    },
  );
  if (!loadClaimSettlementResponse.ok) {
    logger.error(
      `Failed to load claim settlement: ${loadClaimSettlementResponse.status} ${loadClaimSettlementResponse.statusText}`,
    );
    throw new Error('Failed to load claim settlement');
  }
  const loadClaimSettlementData = await loadClaimSettlementResponse.json();
  if (loadClaimSettlementData.Status !== 'OK') {
    logger.error(`Failed to load claim settlement: ${loadClaimSettlementData}`);
    throw new Error('Failed to load claim settlement');
  }
  const claimSettlement = loadClaimSettlementData.Model;
  logger.info('Claim Settlement loaded successfully');

  // 16. Get Payment Method
  logger.info('Getting Payment Method');
  const getPaymentMethodResponse = await fetch(
    `${SERVER_URL}/public/codetable/data/list/75283381`,
    {
      method: 'GET',
      headers,
    },
  );
  if (!getPaymentMethodResponse.ok) {
    logger.error(
      `Failed to get Payment Method: ${getPaymentMethodResponse.status} ${getPaymentMethodResponse.statusText}`,
    );
    throw new Error('Failed to get payment methods');
  }
  const getPaymentMethodData = await getPaymentMethodResponse.json();

  const paymentMethods = getPaymentMethodData as Record<string, unknown>[];
  logger.info(`Payment Methods count: ${paymentMethods.length}`);

  // 17. Get Settlement Partial/Final
  logger.info('Getting Settlement Partial/Final');
  const getSettlementPartialFinalResponse = await fetch(
    `${SERVER_URL}/public/codetable/data/list/1000`,
    {
      method: 'GET',
      headers,
    },
  );
  if (!getSettlementPartialFinalResponse.ok) {
    logger.error(
      `Failed to get Settlement Partial/Final: ${getSettlementPartialFinalResponse.status} ${getSettlementPartialFinalResponse.statusText}`,
    );
    throw new Error('Failed to get partial/final options');
  }
  const getSettlementPartialFinalData =
    await getSettlementPartialFinalResponse.json();

  const partialFinalOptions = getSettlementPartialFinalData as Record<
    string,
    unknown
  >[];
  logger.info(`Partial/Final Options count: ${partialFinalOptions.length}`);

  // 18. Final Settlement Submit
  logger.info('Submitting Final Settlement');

  // PartyRole code 01 is claimant. In this test case, payee is the claimant
  const payee = claimCase.ClaimEntity.ClaimPartyList.find(
    (p: Record<string, unknown>) => p.PartyRole === '01',
  );

  // convert payment method description to code
  const selectedPaymentMethod = paymentMethods.find(
    (p) => p.Description === params.paymentMethod,
  )!.Code;

  // selectively copy the same propreties from reserve structure to settlement
  let settlementItem: Record<string, unknown> = _.pick(
    claimSettlement.ReserveStructure[0],
    [
      'OutstandingAmount',
      'ReserveType',
      'ReserveId',
      'ItemId',
      'CoverageName',
      'ReserveSign',
      'OurShareAmount',
      'SubclaimType',
      'CoverageTypeCode',
      'SeqNo',
    ],
  );

  // convert payment type description to code
  const paymentType = claimSettlement.PaymentTypeCodeTable.find(
    (pt: Record<string, unknown>) => pt.text === params.paymentType,
  ).id;

  settlementItem = {
    ...settlementItem,
    ReserveCurrency: claimSettlement.ReserveStructure[0].CurrencyCode,
    SettleAmount: params.settleAmount,
    '@type': 'ClaimSettlementItem-ClaimSettlementItem',
    Index: 0,
    PayeeIndex: 0,
    OurShareAmount: 0,
    // convert partial / final description to code
    PayFinal: partialFinalOptions.find(
      (pf) => pf.Description === (params.partialFinalOption ?? 'Final'),
    )!.Code,
    PaymentType: paymentType,
  };

  const finalSettlementBody = JSON.stringify({
    SettlementEntity: {
      '@type': 'ClaimSettlement-ClaimSettlement',
      CaseId: caseId,
      ClaimType: claimSettlement.SettlementInfo.ClaimType,
      SettlementPayee: [
        {
          '@pk': null,
          '@type': 'ClaimSettlementPayee-ClaimSettlementPayee',
          SettlementItem: [settlementItem],
          PayeeId: payee['@pk'],
          PayeeName: payee.PartyName,
          PayMode: selectedPaymentMethod, // Selected payment method from step 16
          SettleCurrency: 'USD',
          ReserveExchangeRate: 1,
        },
      ],
    },
    TaskInstanceId: claimSettlementTaskId,
    PolicyNo: claimCase.ClaimEntity.PolicyNo,
  });

  logger.info('calling final settlement API');
  const finalSettlementResponse = await fetch(
    `${SERVER_URL}/settlement/submit/`,
    {
      method: 'POST',
      headers,
      body: finalSettlementBody,
    },
  );
  if (!finalSettlementResponse.ok) {
    logger.error(
      `Failed to submit Final Settlement: ${finalSettlementResponse.status} ${finalSettlementResponse.statusText}`,
    );
    throw new Error('Failed to submit final settlement');
  }
  const finalSettlementData = await finalSettlementResponse.json();
  if (finalSettlementData.Status !== 'OK') {
    logger.error(`Failed to submit Final Settlement: ${finalSettlementData}`);
    throw new Error('Failed to submit final settlement');
  }

  // 19. Notify Payment Done
  const fullClaim = await notifyPaymentDone(
    caseId,
    params.newEcoFnolId,
    currHouseClaimId,
  );

  return fullClaim;
}

async function queryByNewEcoId(
  newEcoFnolId: string,
  expectedCount: number,
  headers: { Authorization: string; 'Content-Type': string },
) {
  logger.info(`Searching claim: ${newEcoFnolId}`);
  const searchClaimBody = JSON.stringify({
    Conditions: {},
    PageNo: 1,
    PageSize: 10,
    FuzzyConditions: { ExtClaimNo: newEcoFnolId },
    Module: 'ClaimCase',
    SortField: 'LastReviewDate',
    SortType: 'DESC',
    SearchType: 0,
  });

  const searchClaimResponse = await fetch(
    `${SERVER_URL}/public/ap00/query/entity`,
    {
      method: 'POST',
      headers,
      body: searchClaimBody,
    },
  );
  if (!searchClaimResponse.ok) {
    logger.error(
      `Failed to search claim: ${searchClaimResponse.status} ${searchClaimResponse.statusText}`,
    );
    throw new Error(
      `Search Claim failed: ${searchClaimResponse.status} ${searchClaimResponse.statusText}`,
    );
  }
  const searchClaimData = await searchClaimResponse.json();
  const count = searchClaimData.Results?.[0].SolrDocs?.length ?? 0;
  logger.info(`Found ${count} claim(s) for ${newEcoFnolId}`);
  if (count != expectedCount) {
    logger.error(
      `Expected ${expectedCount} claim(s) but found ${count} claim(s) for ${newEcoFnolId}`,
    );
    throw new Error(
      `Expected ${expectedCount} claim(s) but found ${count} claim(s) for ${newEcoFnolId}`,
    );
  }
  if (!count) {
    return undefined;
  }

  const searchRslt = searchClaimData.Results[0].SolrDocs[0];
  const ExtClaimNo = searchRslt.ExtClaimNo as string;
  // This is in format "NE:xxxxx;CH:xxxxx". Get the NE and CH separately
  const [newEcoId, currHouseClaimId] = ExtClaimNo.split(';').map(
    (s) => s.split(':')[1],
  );
  logger.info(
    `search claim by newEcoId: ${newEcoId}, currHouseClaimId: ${currHouseClaimId}`,
  );
  searchRslt.newEcoFnolId = newEcoId;
  searchRslt.currHouseClaimId = currHouseClaimId;
  logger.info(`Case ID: ${searchRslt.CaseId}`);
  return searchRslt;
}

async function querySettlement(caseId: string) {
  const headers = getHeaders();

  // 1: Query settlement history
  logger.info('Querying Claim Settlement History');
  const queryClaimSettlementHistoryResponse = await fetch(
    `${SERVER_URL}/settlement/history?caseId=${caseId}&taskCode=ClaimSettlementTask`,
    {
      method: 'GET',
      headers,
    },
  );
  if (!queryClaimSettlementHistoryResponse.ok) {
    logger.error(
      `Failed to query Claim Settlement History: ${queryClaimSettlementHistoryResponse.status} ${queryClaimSettlementHistoryResponse.statusText}`,
    );
    throw new Error('Query Claim Settlement History failed');
  }
  const queryClaimSettlementHistoryData =
    await queryClaimSettlementHistoryResponse.json();

  if (queryClaimSettlementHistoryData.Status !== 'OK') {
    logger.error(
      `Failed to query Claim Settlement History: ${queryClaimSettlementHistoryData}`,
    );
    throw new Error('Query Claim Settlement History failed');
  }
  const settleId = queryClaimSettlementHistoryData.Model[0].SettleId;
  logger.info(`Claim Settlement ID: ${settleId}`);

  // 2: Query settlement detail
  logger.info('Querying Claim Settlement Detail');
  const queryClaimSettlementDetailResponse = await fetch(
    `${SERVER_URL}/settlement/load/bySettlementId/${settleId}`,
    {
      method: 'GET',
      headers,
    },
  );
  if (!queryClaimSettlementDetailResponse.ok) {
    logger.error(
      `Failed to query Claim Settlement Detail: ${queryClaimSettlementDetailResponse.status} ${queryClaimSettlementDetailResponse.statusText}`,
    );
    throw new Error('Query Claim Settlement Detail failed');
  }
  const queryClaimSettlementDetailData =
    await queryClaimSettlementDetailResponse.json();

  if (queryClaimSettlementDetailData.Status !== 'OK') {
    logger.error(
      `Failed to query Claim Settlement Detail: ${queryClaimSettlementDetailData}`,
    );
    throw new Error('Query Claim Settlement Detail failed');
  }
  const settleInfo = queryClaimSettlementDetailData.Model.SettlementInfo;
  logger.info(`Claim Settlement ID in settlement info: ${settleInfo.SettleId}`);

  return settleInfo;
}

async function queryClaimByID(caseId: string) {
  const headers = getHeaders();

  logger.info(`Querying Claim by ID ${caseId}`);
  const queryClaimResponse = await fetch(
    `${SERVER_URL}/claimhandling/caseForm/0/${caseId}`,
    {
      method: 'GET',
      headers,
    },
  );
  if (!queryClaimResponse.ok) {
    logger.error(
      `Failed to query Claim: ${queryClaimResponse.status} ${queryClaimResponse.statusText}`,
    );
    throw new Error('Query Claim failed');
  }
  const queryClaimData = await queryClaimResponse.json();
  if (!_.has(queryClaimData, 'ClaimEntity')) {
    logger.error(`Failed to query Claim: ${queryClaimData}`);
    throw new Error("Query Claim failed: Can't find ClaimEntity");
  }

  return queryClaimData.ClaimEntity;
}

async function notifyPaymentDone(
  caseId: string,
  newEcoFnolId: string,
  currHouseClaimId: string,
) {
  logger.info('Notifying payment done');

  const settleInfo = await querySettlement(caseId);
  settleInfo.newEcoFnolId = newEcoFnolId;
  settleInfo.currHouseClaimId = currHouseClaimId;

  logger.info(`Settlement Info: ${JSON.stringify(settleInfo)}`);

  const claimEntity = await queryClaimByID(caseId);

  // call iHub to notify payment done
  const TRAVELERS_iHub_TOKEN = process.env.TRAVELERS_iHub_TOKEN;
  logger.debug(`Travelers Claim Server Token: ${TRAVELERS_iHub_TOKEN}`);
  const headers = {
    Authorization: `Bearer ${TRAVELERS_iHub_TOKEN}`,
    'Content-Type': 'application/json',
  };

  const fullClaim = {
    claimCase: claimEntity,
    settlementInfo: settleInfo,
  };

  logger.info('Calling iHub to notify payment done');
  await fetch(
    'https://portal-gw.insuremo.com/ebaoeco/1.0/us/sales/travelers/v1/claim/payment/notification',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(fullClaim),
    },
  );
  logger.info('Payment done notification sent successfully');

  return fullClaim;
}
