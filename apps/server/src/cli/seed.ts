// npm run seed — a development workspace holding the design pack's example repository.
// Prints the development token to use with CONNECTOME_DEV_AUTH=1.
import { essentials, insuranceGroup } from "@connectome/content";
import {
  connect,
  createRepository,
  createScenario,
  createWorkspace,
  getRepository,
  withWorkspace,
} from "@connectome/db";
import { ModelService } from "../service";

const WORKSPACE = "W-DEV";
const USER = "dev@example.com";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (and run npm run db:migrate first)");
  process.exit(1);
}

const conn = connect({ connectionString: url });
const principal = { workspaceId: WORKSPACE, userId: USER };
const repoId = insuranceGroup.repository.id;

try {
  const exists = await withWorkspace(conn, WORKSPACE, async (tx) => {
    if (!(await tx.selectFrom("workspace").select("id").where("id", "=", WORKSPACE).executeTakeFirst())) {
      await createWorkspace(tx, { id: WORKSPACE, name: "Development" });
    }
    return Boolean(await getRepository(tx, repoId));
  });
  if (exists) {
    console.log(`Repository ${repoId} already exists; nothing to do.`);
  } else {
    await withWorkspace(conn, WORKSPACE, (tx) =>
      createRepository(tx, {
        id: repoId,
        workspaceId: WORKSPACE,
        name: insuranceGroup.repository.name,
        baselineScenarioId: insuranceGroup.baselineScenarioId,
        settings: insuranceGroup.repository.settings,
        ...essentials,
      }),
    );
    const service = new ModelService(conn);
    const { baselineChange, scenarioChange, targetScenario } = insuranceGroup;
    await service.submit(principal, repoId, undefined, baselineChange());
    await withWorkspace(conn, WORKSPACE, (tx) =>
      createScenario(tx, {
        id: targetScenario.id,
        workspaceId: WORKSPACE,
        repositoryId: repoId,
        parentId: insuranceGroup.baselineScenarioId,
        name: targetScenario.name,
      }),
    );
    const versions = await service.read(
      principal,
      repoId,
      targetScenario.id,
      ({ state }) =>
        (id: string) =>
          (state.objects.get(id) ?? state.relationships.get(id))?.version,
    );
    await service.submit(principal, repoId, targetScenario.id, scenarioChange(versions));
    console.log(`Created "${insuranceGroup.repository.name}" (${repoId}) with the Target 2027 scenario.`);
  }
  console.log(
    `\nStart the server with CONNECTOME_DEV_AUTH=1 and use:\n  Authorization: Bearer dev:${WORKSPACE}:${USER}`,
  );
} finally {
  await conn.close();
}
