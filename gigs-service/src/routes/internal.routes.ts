import { Router, Request, Response } from 'express';
import GigApplication from '../models/GigApplication';

/**
 * Internal routes — consumed only by sibling microservices (events-service,
 * users-service, etc.) within the private VPC / Docker network.
 *
 * Auth boundary: network-level firewall (not token-auth). These routes MUST
 * NOT be exposed to the public internet. In prod the load-balancer / security
 * group denies any external traffic to /internal/*. See DOCS/NETSA_API_Design_v1.md.
 */
const router = Router();

/**
 * GET /internal/gig-applications/count
 * Query params:
 *   source (required) — e.g. 'event:507f1f77bcf86cd799439011'
 * Response:
 *   { data: { source: string, count: number } }
 */
router.get('/gig-applications/count', async (req: Request, res: Response) => {
    const { source } = req.query;
    if (!source || typeof source !== 'string') {
        return res.status(400).json({ message: 'source required' });
    }
    const count = await GigApplication.countDocuments({ source });
    res.json({ data: { source, count } });
});

export default router;
