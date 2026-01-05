class ContractGenerator {
    // Generate gig contract
    static generateGigContract(gigData: any) {
        const contract: any = {
            templateType: 'gig',
            contractId: `GIG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            generatedAt: new Date(),
            terms: {
                artistObligations: [
                    `Arrive ${gigData.setupTime || '30 minutes'} before the event start time`,
                    `Perform for the duration of ${gigData.schedule?.duration || 'agreed time'}`,
                    `Provide own ${gigData.requirements?.equipment?.join(', ') || 'equipment'} as specified`,
                    'Maintain professional conduct throughout the event',
                    'Follow organizer instructions and venue rules',
                ],
                organizerObligations: [
                    'Provide venue as described in the gig details',
                    `Ensure payment of ₹${gigData.compensation?.amount || 0} as agreed`,
                    'Provide safe and suitable working environment',
                    'Honor the agreed schedule and timing',
                    `Provide ${gigData.provisions?.equipment?.join(', ') || 'basic facilities'} as specified`,
                ],
                cancellationPolicy: gigData.cancellationPolicy || 'Cancellation by either party requires 48h notice',
                liabilityClause: 'Each party is responsible for their own equipment and personal safety',
                intellectualPropertyRights: 'Performance rights remain with the artist. Organizer has right to document.',
            },
        };
        // Generate full contract text
        contract.contractText = this.generateGigContractText(gigData, contract);
        return contract;
    }

    // Generate readable contract text for gigs
    static generateGigContractText(gigData: any, contractData: any) {
        return `
PERFORMANCE AGREEMENT
Contract ID: ${contractData.contractId}

This agreement is between:
ORGANIZER: ${gigData.organizerName || 'Organizer'}
ARTIST: [To be filled upon application]

GIG DETAILS:
Event: ${gigData.title}
Date: ${gigData.schedule?.eventDate ? new Date(gigData.schedule.eventDate).toLocaleDateString() : 'TBD'}
Time: ${gigData.schedule?.startTime || 'TBD'} - ${gigData.schedule?.endTime || 'TBD'}
Duration: ${gigData.schedule?.duration || 'TBD'}
Venue: ${gigData.location?.venue || 'TBD'}, ${gigData.location?.city || 'TBD'}, ${gigData.location?.state || 'TBD'}

Compensation: ₹${gigData.compensation?.amount || 0} (${gigData.compensation?.paymentTerms || 'Standard'})

ARTIST OBLIGATIONS:
${contractData.terms.artistObligations.map((item: string) => `• ${item}`).join('\n')}

ORGANIZER OBLIGATIONS:
${contractData.terms.organizerObligations.map((item: string) => `• ${item}`).join('\n')}

TERMS & CONDITIONS:
Cancellation Policy: ${contractData.terms.cancellationPolicy}
Liability: ${contractData.terms.liabilityClause}
Intellectual Property: ${contractData.terms.intellectualPropertyRights}

PAYMENT TERMS:
Total Amount: ₹${gigData.compensation?.amount || 0}
Payment Terms: ${gigData.compensation?.paymentTerms || 'Standard'}
Additional Benefits: ${gigData.compensation?.additionalBenefits?.join(', ') || 'None specified'}

By applying to this gig, the Artist agrees to all terms above.
This contract is legally binding upon application submission.
Generated on: ${new Date().toLocaleString()} via NETSA Platform
`;
    }
}

export default ContractGenerator;
